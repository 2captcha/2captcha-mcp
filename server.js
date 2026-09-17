#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/

// Official 2Captcha MCP server (stdio).
//
// A thin, branded bridge: it connects to the remote 2Captcha Web MCP service
// (Streamable HTTP + bearer token) and mirrors its tools over stdio, so any
// client that can only launch local MCP servers — or that struggles with
// auth headers — gets the full surface with nothing but an API token.
//
// The tool schemas live on the server and are fetched live, so this package
// never drifts from the deployed service. They are also written to a disk
// cache, which is what lets the bridge start and stay registered when the
// network is not there: a laptop that wakes on a dead Wi-Fi must not come
// back with the server missing from the client.

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}
    from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema, CallToolRequestSchema,
    ListPromptsRequestSchema, GetPromptRequestSchema,
    ListResourcesRequestSchema, ReadResourceRequestSchema,
    ListResourceTemplatesRequestSchema}
    from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {createRequire} from 'node:module';
import {webcrypto, createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GROUPS, DEFAULT_GROUPS, build_allowed_tools} from './tool_groups.js';
import {render_prompt, prompt_descriptors} from './prompts.js';

// Node 18 does not expose Web Crypto as a global (it landed in Node 19).
// Parts of the SDK reference `globalThis.crypto` directly and throw without
// it; this keeps the package honest about its `engines: >=18`.
if (typeof globalThis.crypto==='undefined')
    globalThis.crypto = webcrypto;

const require = createRequire(import.meta.url);
const package_json = require('./package.json');

// --- CLI ---------------------------------------------------------------------
// Answered before any env validation, so `npx @2captcha/mcp --version` works
// on a machine that has never set a token — which is exactly the machine
// someone is on when they are trying to work out what they installed.

const HELP = `${package_json.name} v${package_json.version}

Bridges the hosted 2Captcha Web MCP service to a local stdio MCP server.

  npx ${package_json.name}

Environment:
  API_TOKEN         2Captcha API key (https://2captcha.com/setting). Required
                    against the hosted service.
  GROUPS            Tool groups: parsing, batch, captcha, browser (11 login
                    tools), browser_full (all 23), all.
                    Default: ${DEFAULT_GROUPS.join(',')}
  TOOLS             Individual tool names to enable, comma separated.
  MCP_URL           Remote endpoint (default https://mcp.2captcha.com/mcp).
  POLLING_TIMEOUT   Per-call timeout in seconds (default 600).
  RATE_LIMIT        Client-side call cap, e.g. 100/1h or 50/30m.
  MAX_SPEND_USD     Spend cap, e.g. 5 (per session) or 5/1h (per window).
                    Measured from the cost each result reports.
  MAX_CONCURRENCY   Maximum tool calls in flight at once.
  CACHE_DIR         Where to keep the offline tool-list cache.

Options:
  -h, --help        Show this help and exit.
  -v, --version     Print the version and exit.`;

// The only two writes to stdout in this file, and the only two that are safe:
// both exit before the MCP transport is connected, so there is no protocol
// stream to corrupt. `--version | cat` has to work like any other CLI.
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h'))
{
    console.log(HELP); // eslint-disable-line no-restricted-properties
    process.exit(0);
}
if (argv.includes('--version') || argv.includes('-v'))
{
    console.log(package_json.version); // eslint-disable-line no-restricted-properties
    process.exit(0);
}

const DEFAULT_MCP_URL = 'https://mcp.2captcha.com/mcp';
const mcp_url = process.env.MCP_URL || DEFAULT_MCP_URL;
const api_token = process.env.API_TOKEN;
// Tool calls can legitimately run for minutes (render ladder, batch jobs with
// wait_seconds, CAPTCHA solving) — default well above the SDK's 60 s.
const call_timeout_ms = parseInt(process.env.POLLING_TIMEOUT || '600', 10)
    *1000;
const list_timeout_ms = 30*1000;
// A client re-lists tools far more often than the list changes. Serving a
// recent answer from memory costs nothing and removes a network round trip
// from the path a client walks on every single turn.
const TOOLS_TTL_MS = 60*1000;

function fail(msg){
    console.error(`[2captcha-mcp] ${msg}`);
    process.exit(1);
}

function log(msg){
    console.error(`[2captcha-mcp] ${msg}`);
}

// A credential is required against the hosted service. The free tier is per ACCOUNT — every
// authenticated account gets a monthly allowance — so there is no credential-less mode to fall
// back to: identity is what the allowance is metered against. A self-hosted server may still be
// running open (WEBPARSE_ALLOW_UNAUTHENTICATED), so a custom MCP_URL only gets a warning.
if (!api_token && mcp_url===DEFAULT_MCP_URL)
{
    fail('Cannot run without the API_TOKEN env var.\n'
        +'Set it to your 2Captcha API key (from https://2captcha.com/setting) '
        +'or the bearer token your server operator issued.\n'
        +'The free monthly allowance comes WITH an account — it is metered per '
        +'account, so there is no anonymous mode. Signing up is free.');
}
if (!api_token)
{
    log('warning: no API_TOKEN set — connecting to '
        +`${mcp_url} unauthenticated (only works on a server started with `
        +'WEBPARSE_ALLOW_UNAUTHENTICATED=1)');
}

const group_ids = process.env.GROUPS
    ? process.env.GROUPS.split(',').map(g=>g.trim().toLowerCase())
        .filter(Boolean) : [];
const custom_tools = process.env.TOOLS
    ? process.env.TOOLS.split(',').map(t=>t.trim()).filter(Boolean) : [];
const {allowed, unknown_groups} = build_allowed_tools(group_ids, custom_tools);
for (const id of unknown_groups)
    log(`warning: unknown tool group "${id}" — `
        +'known groups: parsing, batch, browser, browser_full, captcha, all');
if (!group_ids.length && !custom_tools.length)
    log('default tool groups active '
        +`(${DEFAULT_GROUPS.join(', ')}) — set GROUPS=browser to add the 11 `
        +'browser login tools, GROUPS=browser_full for all 23, GROUPS=all for '
        +'everything');

// --- budget guards -----------------------------------------------------------
// Both accept the same `N` or `N/<window>` shape, so learning one teaches the
// other.

function parse_window(spec, what){
    const match = spec.match(/^([\d.]+)(?:\/(\d+)([mhs]))?$/);
    if (!match)
        throw new Error(`Invalid ${what} format. Use: 100/1h, 50/30m, or a `
            +'bare number for the whole session');
    const [, amount, time, unit] = match;
    const value = parseFloat(amount);
    if (!(value>0))
        throw new Error(`Invalid ${what}: ${spec} must be greater than zero`);
    const multiplier = unit==='h' ? 3600 : unit==='m' ? 60 : 1;
    return {
        limit: value,
        window: time ? parseInt(time, 10)*multiplier*1000 : Infinity,
        display: spec,
    };
}

function parse_rate_limit(rate_limit_str){
    if (!rate_limit_str)
        return null;
    // Kept stricter than MAX_SPEND_USD on purpose: a call count is an integer
    // and a window is mandatory, which is what every existing RATE_LIMIT
    // value in the wild already looks like.
    const match = rate_limit_str.match(/^(\d+)\/(\d+)([mhs])$/);
    if (!match)
        throw new Error('Invalid RATE_LIMIT format. Use: 100/1h or 50/30m');
    return parse_window(rate_limit_str, 'RATE_LIMIT');
}
const rate_limit_config = parse_rate_limit(process.env.RATE_LIMIT);

// Counting calls is a weak cap for a tool that spends money: one parse_pages
// over 500 URLs costs more than a hundred scrape_page calls. The server
// reports what each call cost, so cap the thing that actually runs out.
const spend_config = process.env.MAX_SPEND_USD
    ? parse_window(process.env.MAX_SPEND_USD.trim(), 'MAX_SPEND_USD') : null;

const max_concurrency = process.env.MAX_CONCURRENCY
    ? parseInt(process.env.MAX_CONCURRENCY, 10) : 0;
if (process.env.MAX_CONCURRENCY && !(max_concurrency>0))
    throw new Error('Invalid MAX_CONCURRENCY: must be a positive integer');

const debug_stats = {tool_calls: {}, session_calls: 0, call_timestamps: [],
    spend: [], spend_usd: 0};

function prune(entries, window){
    if (window===Infinity)
        return entries;
    const start = Date.now()-window;
    return entries.filter(e=>(e.at ?? e)>start);
}

function check_rate_limit(){
    if (!rate_limit_config)
        return;
    debug_stats.call_timestamps = prune(debug_stats.call_timestamps,
        rate_limit_config.window);
    if (debug_stats.call_timestamps.length>=rate_limit_config.limit)
        throw new Error(`Rate limit exceeded: ${rate_limit_config.display}`);
    debug_stats.call_timestamps.push(Date.now());
}

function spent_in_window(){
    if (!spend_config)
        return 0;
    debug_stats.spend = prune(debug_stats.spend, spend_config.window);
    return debug_stats.spend.reduce((sum, e)=>sum+e.usd, 0);
}

// Checked BEFORE the call, against what has already been spent. A single call
// can still carry the total past the cap — the cost is only known once the
// server answers — so this bounds the overshoot to one call rather than
// pretending to be exact.
function check_spend(){
    if (!spend_config)
        return;
    const spent = spent_in_window();
    if (spent>=spend_config.limit)
    {
        throw new Error(`Spend limit reached: $${spent.toFixed(6)} of `
            +`$${spend_config.limit} (MAX_SPEND_USD=${spend_config.display}). `
            +'Raise MAX_SPEND_USD or wait for the window to roll over.');
    }
}

// Results carry their price in a `usage` block, but where that block sits
// depends on the tool: top level for the dict-returning ones, under `meta`
// when `include_meta` is set, per item for batch results. Find them all, and
// stop descending once a node has answered so a parent and its children are
// never both counted.
function find_cost_usd(node, depth = 0){
    if (!node || typeof node!=='object' || depth>5)
        return 0;
    if (node.usage && typeof node.usage.cost_usd==='number')
        return node.usage.cost_usd;
    let total = 0;
    for (const value of Object.values(node))
    {
        if (value && typeof value==='object')
            total += find_cost_usd(value, depth+1);
    }
    return total;
}

function record_spend(result){
    if (!spend_config || !result)
        return;
    let payload = result.structuredContent;
    if (!payload)
    {
        // Tools without an outputSchema answer as text; it is usually the
        // same JSON. A tool that answers in prose simply reports no cost,
        // which is correct — this guard must never turn a good result into
        // an error.
        const text = (result.content || []).map(c=>c.text || '').join('');
        try { payload = JSON.parse(text); } catch(_e){ return; }
    }
    const usd = find_cost_usd(payload);
    if (!(usd>0))
        return;
    debug_stats.spend.push({at: Date.now(), usd});
    debug_stats.spend_usd += usd;
}

// A cap on calls in flight. Without it, an agent that fans out over a URL list
// opens as many sockets as it has URLs, and the first thing that breaks is the
// account's own rate limit at the far end.
let in_flight = 0;
const waiting = [];

async function with_slot(fn){
    if (!max_concurrency)
        return await fn();
    if (in_flight>=max_concurrency)
        await new Promise(resolve=>waiting.push(resolve));
    in_flight++;
    try {
        return await fn();
    } finally {
        in_flight--;
        waiting.shift()?.();
    }
}

// --- retrying transport ------------------------------------------------------
// Retries live in fetch rather than around the SDK call because this is the
// only layer that can see the status code and the Retry-After header. Above
// it, a 429 and a 503 arrive as prose in an Error message.

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

const sleep = ms=>new Promise(resolve=>setTimeout(resolve, ms));

// Retry-After is either seconds or an HTTP date. Both appear in the wild.
function retry_after_ms(response){
    const header = response.headers?.get?.('retry-after');
    if (!header)
        return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds))
        return Math.max(0, seconds*1000);
    const when = Date.parse(header);
    return Number.isNaN(when) ? null : Math.max(0, when-Date.now());
}

function is_transient_network_error(e){
    const msg = String(e?.message||e);
    return /fetch failed|econnrefused|econnreset|socket hang up|network error|eai_again|enotfound|etimedout/i
        .test(msg);
}

// Capped so a Retry-After of an hour cannot wedge a tool call that the client
// is synchronously waiting on.
const MAX_BACKOFF_MS = 20*1000;

async function retrying_fetch(url, init = {}){
    let delay = BASE_DELAY_MS;
    for (let attempt = 1; ; attempt++)
    {
        let response;
        try {
            response = await fetch(url, init);
        } catch(e){
            if (attempt>=MAX_ATTEMPTS || init.signal?.aborted
                || !is_transient_network_error(e))
            {
                throw e;
            }
            log(`${e?.message||e} — retrying in ${delay}ms `
                +`(attempt ${attempt}/${MAX_ATTEMPTS})`);
            await sleep(delay);
            delay *= 2;
            continue;
        }
        if (!RETRY_STATUS.has(response.status) || attempt>=MAX_ATTEMPTS)
            return response;
        const wait = Math.min(retry_after_ms(response) ?? delay,
            MAX_BACKOFF_MS);
        log(`${response.status} from ${mcp_url} — retrying in ${wait}ms `
            +`(attempt ${attempt}/${MAX_ATTEMPTS})`);
        // The body has to be consumed or the socket is held open until GC.
        try { await response.arrayBuffer(); } catch(_e){ /* nothing to drain */ }
        await sleep(wait);
        delay *= 2;
    }
}

// --- remote connection -------------------------------------------------------

let remote_client = null;
let connecting = null;

async function connect_remote(){
    const client = new Client(
        {name: package_json.name, version: package_json.version},
        {capabilities: {}});
    const headers = {
        'user-agent': `${package_json.name}/${package_json.version}`,
        ...api_token ? {authorization: `Bearer ${api_token}`} : {},
    };
    const transport = new StreamableHTTPClientTransport(new URL(mcp_url),
        {requestInit: {headers}, fetch: retrying_fetch});
    await client.connect(transport);
    return client;
}

// Collapses concurrent first-callers onto one connection attempt: without
// this, a client that fires tools/list and a tool call together opens two.
async function get_remote(){
    if (remote_client)
        return remote_client;
    if (!connecting)
    {
        connecting = connect_remote()
            .then(client=>{
                remote_client = client;
                return client;
            })
            .finally(()=>{
                connecting = null;
            });
    }
    return await connecting;
}

function is_connection_error(e){
    const msg = String(e?.message||e);
    return /connection closed|not connected|fetch failed|econnrefused|econnreset|socket hang up|terminated|network error|other side closed/i
        .test(msg);
}

function is_auth_error(e){
    const msg = String(e?.message||e);
    return e?.code===401 || e?.code===403
        || /401|403|unauthorized|forbidden|invalid[_ ]token/i.test(msg);
}

// Run fn against the remote, transparently reconnecting once if the
// connection died between calls (laptop slept, server restarted, …).
async function with_remote(fn){
    let client = await get_remote();
    try {
        return await fn(client);
    } catch(e){
        if (!is_connection_error(e))
            throw e;
        log(`remote connection lost, reconnecting: ${e?.message||e}`);
        try { await client.close(); } catch(_e){ /* already dead */ }
        remote_client = null;
        client = await get_remote();
        return await fn(client);
    }
}

// --- offline tool-list cache -------------------------------------------------
// Keyed by endpoint, so a self-hosted MCP_URL never serves the hosted
// service's tool list back to you.

function cache_dir(){
    if (process.env.CACHE_DIR)
        return process.env.CACHE_DIR;
    const {platform, env} = process;
    if (platform==='win32' && env.LOCALAPPDATA)
        return path.join(env.LOCALAPPDATA, '2captcha-mcp', 'Cache');
    if (platform==='darwin')
        return path.join(os.homedir(), 'Library', 'Caches', '2captcha-mcp');
    return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
        '2captcha-mcp');
}

function cache_file(){
    const key = createHash('sha256').update(mcp_url).digest('hex').slice(0, 16);
    return path.join(cache_dir(), `tools-${key}.json`);
}

// Every cache operation is best-effort: a read-only home directory, a full
// disk or a half-written file must degrade this to "no cache", never to a
// server that will not start.
function load_cache(){
    try {
        const raw = JSON.parse(fs.readFileSync(cache_file(), 'utf8'));
        if (!Array.isArray(raw.tools))
            return null;
        return raw;
    } catch(_e){
        return null;
    }
}

function save_cache(tools, instructions){
    try {
        fs.mkdirSync(cache_dir(), {recursive: true});
        fs.writeFileSync(cache_file(), JSON.stringify({
            url: mcp_url, saved_at: new Date().toISOString(),
            version: package_json.version, instructions, tools}));
    } catch(e){
        log(`note: could not write the offline tool cache (${e?.message||e})`);
    }
}

// --- tool-list fetching ------------------------------------------------------
// The SDK's client.listTools() hard-rejects a list where any tool strays from
// the spec (e.g. an outputSchema whose top level is a union instead of
// "object" — a real occurrence: Pydantic renders `A | B` as bare `anyOf`).
// Fetch permissively instead, and sanitize: a broken schema on one tool must
// degrade that tool's metadata, not kill the whole connection.

const raw_list_schema = z.object({tools: z.array(z.any())}).passthrough();
const schema_notes = new Set();

function sanitize_tool(tool){
    const t = {...tool};
    if (!t.inputSchema || typeof t.inputSchema!=='object'
        || t.inputSchema.type!=='object')
        t.inputSchema = {type: 'object', properties: {}};
    if (t.outputSchema && (typeof t.outputSchema!=='object'
        || t.outputSchema.type!=='object'))
    {
        if (!schema_notes.has(t.name))
        {
            schema_notes.add(t.name);
            log(`note: tool "${t.name}" advertises `
                +'a non-object outputSchema (spec requires type "object") — '
                +'serving it without one');
        }
        delete t.outputSchema;
    }
    return t;
}

async function list_remote_tools(client){
    const res = await client.request(
        {method: 'tools/list', params: {}},
        raw_list_schema, {timeout: list_timeout_ms});
    return res.tools.filter(t=>t && typeof t.name==='string')
        .map(sanitize_tool);
}

// --- startup -----------------------------------------------------------------
// Nothing here touches the network. The stdio server comes up on the cached
// list, and the first refresh happens in the background — so a machine with no
// route to the internet still registers a working server, and the tools
// reappear by notification the moment the network does.

const cached = load_cache();
let cached_tools = cached?.tools || [];
let tools_fetched_at = 0;
let remote_instructions = cached?.instructions;
let reported_surface = false;

if (cached_tools.length)
    log(`starting from the cached tool list (${cached_tools.length} tools, `
        +`saved ${cached.saved_at}) — refreshing in the background`);

// The group tables are static while the tool SCHEMAS are live, so this package
// cannot fall behind the server on what a tool looks like, but it absolutely
// can on which tools EXIST. It did: the server advertised
// discover_search_params for weeks while no group listed it, so every default
// client filtered out a working tool and nothing said so. Reported once, after
// the first real list arrives — the cached list is not evidence about today's
// server.
function report_surface_drift(){
    if (reported_surface || !allowed)
        return;
    reported_surface = true;
    const advertised = new Set(cached_tools.map(t=>t.name));
    const missing = [...allowed].filter(name=>!advertised.has(name));
    if (missing.length)
        log('note: enabled but not advertised by '
            +`the server (likely disabled server-side): ${missing.join(', ')}`);
    const claimed = new Set(Object.values(GROUPS).flatMap(g=>g.tools));
    const unclaimed = cached_tools.map(t=>t.name)
        .filter(name=>!claimed.has(name) && name!=='session_stats');
    if (unclaimed.length)
    {
        log('note: advertised by the server but in no '
            +`tool group, so only GROUPS=all or TOOLS= reaches it: ${
                unclaimed.join(', ')}`
            // Only a packaging bug when it is OUR server: a self-hosted deployment with its own
            // tools will legitimately advertise names this package has never heard of.
            +(mcp_url===DEFAULT_MCP_URL
                ? ' — please report this as a packaging bug' : ''));
    }
}

let refreshing = null;

// Returns true if the list changed, so the caller can decide whether the
// client needs a notification.
async function refresh_tools(){
    if (refreshing)
        return await refreshing;
    refreshing = (async ()=>{
        const before = JSON.stringify(cached_tools.map(t=>t.name));
        const client = await get_remote();
        const instructions = client.getInstructions?.();
        const tools = await with_remote(list_remote_tools);
        cached_tools = tools;
        tools_fetched_at = Date.now();
        if (instructions)
            remote_instructions = instructions;
        save_cache(tools, remote_instructions);
        report_surface_drift();
        return before!==JSON.stringify(tools.map(t=>t.name));
    })().finally(()=>{
        refreshing = null;
    });
    return await refreshing;
}

// A bad token is deterministic: it will not fix itself on the next call, and
// telling the user now is better than surfacing it as a mysterious tool error
// later. Everything else — no route, DNS down, service restarting — is
// transient and must not take the server with it.
function handle_startup_error(e){
    const msg = String(e?.message||e);
    if (is_auth_error(e))
    {
        // Two different problems behind one status, and the fix differs: a token that was
        // rejected, or no token at all against a server that requires one. Saying "check
        // API_TOKEN" to someone who deliberately set none is the unhelpful half of that.
        fail(api_token
            ? `Authentication to ${mcp_url} failed — check API_TOKEN.\n(${msg})`
            : `${mcp_url} requires a credential and none was sent. Set API_TOKEN to your `
                +'2Captcha API key (https://2captcha.com/setting), or start the server with '
                +`WEBPARSE_ALLOW_UNAUTHENTICATED=1 if it is your own.\n(${msg})`);
    }
    log(`could not reach ${mcp_url} yet (${msg}) — serving `
        +`${cached_tools.length} cached tool(s) and retrying on demand. The `
        +'server stays registered; tool calls will report this until it '
        +'clears.');
}

// Refresh if the cached list is older than the TTL. Callers that can wait
// (tools/list with nothing cached) await it; callers that cannot serve what
// they have and let the notification catch the client up.
async function ensure_fresh({wait}){
    if (Date.now()-tools_fetched_at<TOOLS_TTL_MS)
        return;
    const task = refresh_tools().then(async changed=>{
        if (changed && !wait)
            await server.sendToolListChanged().catch(()=>{});
    }).catch(e=>{
        if (is_auth_error(e))
            handle_startup_error(e);
        else
            log(`tools/list refresh failed, serving the cached list: ${e?.message||e}`);
    });
    if (wait)
        await task;
}

// --- local stdio server ------------------------------------------------------

const session_stats_tool = {
    name: 'session_stats',
    description: 'Tell the user about the tool usage during this session',
    inputSchema: {type: 'object', properties: {}},
};

function visible_tools(tools){
    const list = allowed ? tools.filter(t=>allowed.has(t.name)) : tools;
    return [...list, session_stats_tool];
}

const server = new Server(
    {name: '2Captcha', title: '2Captcha Web MCP',
        version: package_json.version},
    {capabilities: {
        // listChanged on all three: the tool list genuinely arrives after
        // startup now, and a client that was told the list is static would
        // never come back for it.
        tools: {listChanged: true},
        prompts: {listChanged: true},
        resources: {listChanged: true},
    },
    ...remote_instructions ? {instructions: remote_instructions} : {}});

server.setRequestHandler(ListToolsRequestSchema, async ()=>{
    // With nothing cached there is nothing useful to answer with, so this one
    // waits. With a cached list, answer now and refresh behind it.
    await ensure_fresh({wait: !cached_tools.length});
    return {tools: visible_tools(cached_tools)};
});

function tool_error(message){
    return {content: [{type: 'text', text: `Error: ${message}`}],
        isError: true};
}

server.setRequestHandler(CallToolRequestSchema, async (req)=>{
    const {name} = req.params;
    const args = req.params.arguments ?? {};
    if (name==='session_stats')
    {
        const used = Object.entries(debug_stats.tool_calls)
            .map(([tool, calls])=>`${tool}: ${calls} call(s)`);
        const lines = [
            `Session stats (${package_json.name} v${package_json.version})`,
            `Total tool calls: ${debug_stats.session_calls}`,
            ...rate_limit_config
                ? [`Rate limit: ${rate_limit_config.display} — `
                    +`${debug_stats.call_timestamps.length} call(s) in the `
                    +'current window'] : [],
            ...spend_config
                ? [`Spend limit: $${spend_config.limit} `
                    +`(${spend_config.display}) — $${
                        spent_in_window().toFixed(6)} in the current window, `
                    +`$${debug_stats.spend_usd.toFixed(6)} this session`]
                : [`Measured spend this session: $${
                    debug_stats.spend_usd.toFixed(6)}`],
            ...max_concurrency
                ? [`Concurrency: ${in_flight}/${max_concurrency} in flight`]
                : [],
            used.length ? 'Calls by tool:' : 'No remote tools called yet.',
            ...used.map(l=>`  ${l}`),
        ];
        return {content: [{type: 'text', text: lines.join('\n')}]};
    }
    if (allowed && !allowed.has(name))
        return tool_error(`Tool "${name}" is not enabled. Enable it with the `
            +'GROUPS or TOOLS env var (e.g. GROUPS=all), or check '
            +'session_stats for what is available.');
    try {
        check_rate_limit();
        check_spend();
        debug_stats.tool_calls[name] = (debug_stats.tool_calls[name]||0)+1;
        debug_stats.session_calls++;
        const result = await with_slot(()=>with_remote(
            c=>c.callTool({name, arguments: args}, undefined,
                {timeout: call_timeout_ms, resetTimeoutOnProgress: true})));
        record_spend(result);
        return result;
    } catch(e){
        return tool_error(String(e?.message||e));
    }
});

// --- prompts and resources ---------------------------------------------------
// Prompts are ours (the recipes from examples/), plus anything the remote
// advertises. Resources are purely a pass-through — this package has none of
// its own, but the service's TOOLS.md and cost table belong in front of the
// user rather than behind a tool call.

function remote_has(capability){
    return Boolean(remote_client?.getServerCapabilities?.()?.[capability]);
}

async function remote_or_empty(capability, fn, empty){
    // Unlike startup, a list request can afford to wait for a connection —
    // it is answering a question the client just asked, not deciding whether
    // the server exists. An unreachable remote still degrades to `empty`.
    if (!remote_client)
    {
        try { await get_remote(); } catch(e){
            log(`${capability} list unavailable: ${e?.message||e}`);
            return empty;
        }
    }
    if (!remote_has(capability))
        return empty;
    try {
        return await with_remote(fn);
    } catch(e){
        log(`${capability} passthrough failed: ${e?.message||e}`);
        return empty;
    }
}

server.setRequestHandler(ListPromptsRequestSchema, async ()=>{
    const local = prompt_descriptors();
    const names = new Set(local.map(p=>p.name));
    const remote = await remote_or_empty('prompts',
        c=>c.listPrompts(), {prompts: []});
    return {prompts: [...local,
        ...(remote.prompts || []).filter(p=>!names.has(p.name))]};
});

server.setRequestHandler(GetPromptRequestSchema, async (req)=>{
    const {name, arguments: args} = req.params;
    const local = render_prompt(name, args || {});
    if (local)
        return local;
    if (!remote_has('prompts'))
        throw new Error(`Unknown prompt: ${name}`);
    return await with_remote(c=>c.getPrompt({name, arguments: args || {}}));
});

server.setRequestHandler(ListResourcesRequestSchema, async ()=>
    await remote_or_empty('resources', c=>c.listResources(), {resources: []}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async ()=>
    await remote_or_empty('resources', c=>c.listResourceTemplates(),
        {resourceTemplates: []}));

server.setRequestHandler(ReadResourceRequestSchema, async (req)=>{
    if (!remote_has('resources'))
        throw new Error(`Unknown resource: ${req.params.uri}`);
    return await with_remote(c=>c.readResource({uri: req.params.uri}));
});

// --- go ----------------------------------------------------------------------
// stdio first. The client gets a live server immediately and the remote is
// dialled behind it, which is the whole point: startup no longer depends on
// the network being there.

const transport = new StdioServerTransport();
await server.connect(transport);
log(`${package_json.name} v${package_json.version} ready on stdio → `
    +`${mcp_url}`);

refresh_tools().then(async ()=>{
    log(`connected to ${mcp_url} — `
        +`${cached_tools.length} tools advertised by the server`);
    await server.sendToolListChanged().catch(()=>{});
}).catch(handle_startup_error);
