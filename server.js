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
// never drifts from the deployed service.

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}
    from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema, CallToolRequestSchema}
    from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {GROUPS, DEFAULT_GROUPS, build_allowed_tools} from './tool_groups.js';

// Node 18 does not expose Web Crypto as a global (it landed in Node 19).
// Parts of the SDK reference `globalThis.crypto` directly and throw without
// it; this keeps the package honest about its `engines: >=18`.
if (typeof globalThis.crypto==='undefined')
    globalThis.crypto = webcrypto;

const require = createRequire(import.meta.url);
const package_json = require('./package.json');

const DEFAULT_MCP_URL = 'https://mcp.2captcha.com/mcp';
const mcp_url = process.env.MCP_URL || DEFAULT_MCP_URL;
const api_token = process.env.API_TOKEN;
// Tool calls can legitimately run for minutes (render ladder, batch jobs with
// wait_seconds, CAPTCHA solving) — default well above the SDK's 60 s.
const call_timeout_ms = parseInt(process.env.POLLING_TIMEOUT || '600', 10)
    *1000;
const list_timeout_ms = 30*1000;

function fail(msg){
    console.error(`[2captcha-mcp] ${msg}`);
    process.exit(1);
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
    console.error('[2captcha-mcp] warning: no API_TOKEN set — connecting to '
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
    console.error(`[2captcha-mcp] warning: unknown tool group "${id}" — `
        +'known groups: parsing, batch, browser, browser_full, captcha, all');
if (!group_ids.length && !custom_tools.length)
    console.error('[2captcha-mcp] default tool groups active '
        +`(${DEFAULT_GROUPS.join(', ')}) — set GROUPS=browser to add the 11 `
        +'browser login tools, GROUPS=browser_full for all 23, GROUPS=all for '
        +'everything');

function parse_rate_limit(rate_limit_str){
    if (!rate_limit_str)
        return null;
    const match = rate_limit_str.match(/^(\d+)\/(\d+)([mhs])$/);
    if (!match)
        throw new Error('Invalid RATE_LIMIT format. Use: 100/1h or 50/30m');
    const [, limit, time, unit] = match;
    const multiplier = unit==='h' ? 3600 : unit==='m' ? 60 : 1;
    return {
        limit: parseInt(limit, 10),
        window: parseInt(time, 10)*multiplier*1000,
        display: rate_limit_str,
    };
}
const rate_limit_config = parse_rate_limit(process.env.RATE_LIMIT);

const debug_stats = {tool_calls: {}, session_calls: 0, call_timestamps: []};

function check_rate_limit(){
    if (!rate_limit_config)
        return;
    const window_start = Date.now()-rate_limit_config.window;
    debug_stats.call_timestamps = debug_stats.call_timestamps
        .filter(ts=>ts>window_start);
    if (debug_stats.call_timestamps.length>=rate_limit_config.limit)
        throw new Error(`Rate limit exceeded: ${rate_limit_config.display}`);
    debug_stats.call_timestamps.push(Date.now());
}

// --- remote connection ------------------------------------------------------

let remote_client = null;

async function connect_remote(){
    const client = new Client(
        {name: package_json.name, version: package_json.version},
        {capabilities: {}});
    const headers = {
        'user-agent': `${package_json.name}/${package_json.version}`,
        ...api_token ? {authorization: `Bearer ${api_token}`} : {},
    };
    const transport = new StreamableHTTPClientTransport(new URL(mcp_url),
        {requestInit: {headers}});
    await client.connect(transport);
    return client;
}

async function get_remote(){
    if (!remote_client)
        remote_client = await connect_remote();
    return remote_client;
}

function is_connection_error(e){
    const msg = String(e?.message||e);
    return /connection closed|not connected|fetch failed|econnrefused|econnreset|socket hang up|terminated|network error|other side closed/i
        .test(msg);
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
        console.error('[2captcha-mcp] remote connection lost, reconnecting:',
            e?.message||e);
        try { await client.close(); } catch(_e){ /* already dead */ }
        remote_client = null;
        client = await get_remote();
        return await fn(client);
    }
}

// --- tool-list fetching --------------------------------------------------
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
            console.error(`[2captcha-mcp] note: tool "${t.name}" advertises `
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

// --- startup: connect eagerly so a bad token fails loudly, not on first use -

let cached_tools = [];
let remote_instructions;
try {
    const client = await get_remote();
    remote_instructions = client.getInstructions?.();
    cached_tools = await list_remote_tools(client);
    console.error(`[2captcha-mcp] connected to ${mcp_url} — `
        +`${cached_tools.length} tools advertised by the server`);
} catch(e){
    const msg = String(e?.message||e);
    if (/401|403|unauthorized|forbidden|invalid[_ ]token/i.test(msg))
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
    fail(`Could not reach ${mcp_url}: ${msg}`);
}

if (allowed)
{
    const advertised = new Set(cached_tools.map(t=>t.name));
    const missing = [...allowed].filter(name=>!advertised.has(name));
    if (missing.length)
        console.error('[2captcha-mcp] note: enabled but not advertised by '
            +`the server (likely disabled server-side): ${missing.join(', ')}`);
    // The other direction, and the one that bites silently. Tool SCHEMAS are pulled live, so this
    // package cannot fall behind the server on what a tool looks like — but the group tables are
    // static, so it absolutely can fall behind on which tools EXIST. It did: the server advertised
    // discover_search_params for weeks while no group listed it, so every default client filtered
    // out a working tool and nothing said so. A tool the server offers and no group claims is now
    // a visible note.
    const claimed = new Set(Object.values(GROUPS).flatMap(g=>g.tools));
    const unclaimed = cached_tools.map(t=>t.name)
        .filter(name=>!claimed.has(name) && name!=='session_stats');
    if (unclaimed.length)
    {
        console.error('[2captcha-mcp] note: advertised by the server but in no '
            +`tool group, so only GROUPS=all or TOOLS= reaches it: ${
                unclaimed.join(', ')}`
            // Only a packaging bug when it is OUR server: a self-hosted deployment with its own
            // tools will legitimately advertise names this package has never heard of.
            +(mcp_url===DEFAULT_MCP_URL
                ? ' — please report this as a packaging bug' : ''));
    }
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
    {capabilities: {tools: {}},
        ...remote_instructions ? {instructions: remote_instructions} : {}});

server.setRequestHandler(ListToolsRequestSchema, async ()=>{
    try {
        cached_tools = await with_remote(list_remote_tools);
    } catch(e){
        console.error('[2captcha-mcp] tools/list refresh failed, serving '
            +'cached list:', e?.message||e);
    }
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
        debug_stats.tool_calls[name] = (debug_stats.tool_calls[name]||0)+1;
        debug_stats.session_calls++;
        return await with_remote(c=>c.callTool({name, arguments: args},
            undefined,
            {timeout: call_timeout_ms, resetTimeoutOnProgress: true}));
    } catch(e){
        return tool_error(String(e?.message||e));
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[2captcha-mcp] ${package_json.name} `
    +`v${package_json.version} ready on stdio → ${mcp_url}`);
