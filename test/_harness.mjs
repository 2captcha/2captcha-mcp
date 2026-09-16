'use strict'; /*jslint node:true es9:true*/

// Shared end-to-end harness: a fake remote Web MCP service (Streamable HTTP,
// stateless — the same transport shape the real server uses) behind the actual
// server.js spawned as a child process and driven over stdio.
//
// The fake is scriptable because most of what sprint 2 added is behaviour
// under failure: a remote that is down, one that answers 503 twice and then
// works, one that rejects the token. None of that is reachable by testing
// against a remote that always succeeds.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport}
    from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema, CallToolRequestSchema,
    ListPromptsRequestSchema, GetPromptRequestSchema,
    ListResourcesRequestSchema, ReadResourceRequestSchema}
    from '@modelcontextprotocol/sdk/types.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {webcrypto} from 'node:crypto';

// The SDK's server-side Streamable HTTP transport calls crypto.randomUUID()
// on the global, which Node 18 does not define. That transport only exists
// here, in the fake remote — the real remote is a Python service — so this
// polyfill belongs to the test harness, not to what we ship.
if (typeof globalThis.crypto==='undefined')
    globalThis.crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_JS = path.join(__dirname, '..', 'server.js');

export const REMOTE_TOOLS = [
    // Deliberately spec-violating outputSchema (bare anyOf, no top-level
    // type) — the shape the deployed webparse actually emitted for a
    // union return type. The proxy must sanitize it, not die.
    {name: 'scrape_page', description: 'fake scrape',
        inputSchema: {type: 'object',
            properties: {url: {type: 'string'}}, required: ['url']},
        outputSchema: {anyOf: [{type: 'object'}, {type: 'string'}],
            title: 'ScrapeResult | JobStatus'}},
    {name: 'browser_navigate', description: 'fake browser nav',
        inputSchema: {type: 'object',
            properties: {url: {type: 'string'}}, required: ['url']}},
    {name: 'echo', description: 'echo args back',
        inputSchema: {type: 'object',
            properties: {text: {type: 'string'}}}},
];

// A tool that reports a price, so the spend guard has something to meter.
export const PRICED_TOOL = {
    name: 'parse_marketplace', description: 'fake priced parse',
    inputSchema: {type: 'object', properties: {url: {type: 'string'}}},
};

// A tool that takes long enough for several calls to overlap, which is the
// only way to observe a concurrency cap at all.
export const SLOW_TOOL = {
    name: 'slow', description: 'sleeps, so calls overlap',
    inputSchema: {type: 'object', properties: {}},
};

function make_remote_mcp(opts){
    const s = new Server({name: 'fake-webparse', version: '0.0.1'},
        {capabilities: {
            tools: {},
            ...opts.prompts ? {prompts: {}} : {},
            ...opts.resources ? {resources: {}} : {},
        }, instructions: 'fake instructions'});
    s.setRequestHandler(ListToolsRequestSchema,
        async ()=>({tools: opts.tools}));
    s.setRequestHandler(CallToolRequestSchema, async (req)=>{
        const {name} = req.params;
        if (name==='echo')
        {
            return {content: [{type: 'text',
                text: `echo:${req.params.arguments?.text}`}]};
        }
        if (name==='scrape_page')
            return {content: [{type: 'text', text: 'fake page content'}]};
        if (name==='parse_marketplace')
        {
            // The shape the real service returns under include_meta: the
            // price of the call lives in meta.usage.cost_usd.
            return {content: [{type: 'text', text: JSON.stringify(
                {data: {rows: []}, meta: {tier: 'api',
                    usage: {cost_usd: opts.cost_usd, duration_ms: 1}}})}]};
        }
        if (name==='slow')
        {
            await new Promise(r=>setTimeout(r, opts.slow_ms));
            return {content: [{type: 'text', text: 'slow done'}]};
        }
        throw new Error(`unexpected tool ${name}`);
    });
    if (opts.prompts)
    {
        s.setRequestHandler(ListPromptsRequestSchema, async ()=>({prompts: [
            {name: 'remote_recipe', description: 'a prompt from the server'},
        ]}));
        s.setRequestHandler(GetPromptRequestSchema, async ()=>({
            messages: [{role: 'user',
                content: {type: 'text', text: 'remote prompt body'}}]}));
    }
    if (opts.resources)
    {
        s.setRequestHandler(ListResourcesRequestSchema, async ()=>({
            resources: [{uri: 'docs://TOOLS.md', name: 'TOOLS.md',
                mimeType: 'text/markdown'}]}));
        s.setRequestHandler(ReadResourceRequestSchema, async (req)=>({
            contents: [{uri: req.params.uri, mimeType: 'text/markdown',
                text: 'the cost table'}]}));
    }
    return s;
}

// Stateless Streamable HTTP host: fresh server+transport per POST, exactly
// the recommended stateless pattern (and what webparse runs).
//
// `script` is an array of responses to serve before behaving normally, so a
// test can say "503, 503, then work" and assert that the client got through.
export async function start_remote({
    tools = REMOTE_TOOLS, auth = null, script = [], prompts = false,
    resources = false, cost_usd = 0, slow_ms = 50} = {}){
    const state = {seen_auth: [], posts: 0, tool_lists: 0, in_flight: 0,
        max_in_flight: 0};
    const queue = [...script];
    const httpd = http.createServer(async (req, res)=>{
        state.seen_auth.push(req.headers.authorization);
        if (req.method!=='POST')
        {
            res.writeHead(405, {allow: 'POST'}).end();
            return;
        }
        state.posts++;
        // High-water mark of overlapping requests. A concurrency cap is only
        // observable from the far end — counting calls proves nothing about
        // how many were in flight together.
        state.in_flight++;
        state.max_in_flight = Math.max(state.max_in_flight, state.in_flight);
        res.on('close', ()=>{
            state.in_flight--;
        });
        let body = '';
        for await (const chunk of req)
            body += chunk;
        if (/"method":"tools\/list"/.test(body))
            state.tool_lists++;

        if (auth && req.headers.authorization!==`Bearer ${auth}`)
        {
            res.writeHead(401, {'content-type': 'application/json'})
                .end(JSON.stringify({error: 'invalid_token'}));
            return;
        }
        const scripted = queue.shift();
        if (scripted)
        {
            const headers = {'content-type': 'application/json'};
            if (scripted.retry_after!==undefined)
                headers['retry-after'] = String(scripted.retry_after);
            res.writeHead(scripted.status, headers)
                .end(JSON.stringify({error: 'scripted failure'}));
            return;
        }
        const mcp = make_remote_mcp({tools, prompts, resources, cost_usd,
            slow_ms});
        const transport = new StreamableHTTPServerTransport(
            {sessionIdGenerator: undefined, enableJsonResponse: true});
        res.on('close', ()=>{
            transport.close();
            mcp.close();
        });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, JSON.parse(body));
    });
    await new Promise(resolve=>httpd.listen(0, '127.0.0.1', resolve));
    return {
        httpd,
        state,
        url: `http://127.0.0.1:${httpd.address().port}/mcp`,
        close: ()=>new Promise(resolve=>httpd.close(resolve)),
    };
}

// Every env var the server reads, so a test never inherits one from the
// developer's shell — an exported GROUPS would silently change what half of
// these assert.
const OWNED_ENV = ['GROUPS', 'TOOLS', 'RATE_LIMIT', 'POLLING_TIMEOUT',
    'MAX_SPEND_USD', 'MAX_CONCURRENCY', 'MCP_URL', 'API_TOKEN', 'CACHE_DIR'];

export function clean_env(extra = {}){
    const env = {...process.env, ...extra};
    for (const key of OWNED_ENV)
    {
        if (!(key in extra))
            delete env[key];
    }
    return env;
}

// Each test gets its own cache directory: the offline-start tests are about
// what is on disk, so a cache shared with another test would make them pass
// or fail depending on order.
export function temp_cache(){
    return fs.mkdtempSync(path.join(os.tmpdir(), '2captcha-mcp-test-'));
}

export async function start_proxy(env, {on_stderr} = {}){
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [SERVER_JS],
        env,
        stderr: 'pipe',
    });
    const client = new Client({name: 'test-client', version: '0.0.0'});
    const lines = [];
    // Surface the child's stderr as test diagnostics. Without this a crash in
    // server.js reaches CI as a bare "Connection closed" with no cause.
    transport.stderr?.on('data', chunk=>{
        for (const line of String(chunk).split('\n').filter(Boolean))
        {
            lines.push(line);
            on_stderr?.(line);
            console.error(`[server.js] ${line}`);
        }
    });
    await client.connect(transport);
    client.stderr_lines = lines;
    return client;
}

// Waits for a condition the server reaches asynchronously (a background
// refresh, a retry sequence) instead of sleeping a guessed interval.
export async function until(predicate, {timeout = 10000, step = 25} = {}){
    const deadline = Date.now()+timeout;
    for (;;)
    {
        if (await predicate())
            return true;
        if (Date.now()>deadline)
            throw new Error('timed out waiting for condition');
        await new Promise(r=>setTimeout(r, step));
    }
}
