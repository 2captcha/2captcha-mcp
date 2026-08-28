'use strict'; /*jslint node:true es9:true*/
// End-to-end: a fake remote Web MCP service (Streamable HTTP, stateless —
// the same transport shape the real server uses) behind the actual server.js
// spawned as a child process and driven over stdio.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport}
    from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema, CallToolRequestSchema}
    from '@modelcontextprotocol/sdk/types.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server_js = path.join(__dirname, '..', 'server.js');

const REMOTE_TOOLS = [
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

function make_remote_mcp(){
    const s = new Server({name: 'fake-webparse', version: '0.0.1'},
        {capabilities: {tools: {}}, instructions: 'fake instructions'});
    s.setRequestHandler(ListToolsRequestSchema,
        async ()=>({tools: REMOTE_TOOLS}));
    s.setRequestHandler(CallToolRequestSchema, async (req)=>{
        if (req.params.name==='echo')
        {
            return {content: [{type: 'text',
                text: `echo:${req.params.arguments?.text}`}]};
        }
        if (req.params.name==='scrape_page')
            return {content: [{type: 'text', text: 'fake page content'}]};
        throw new Error(`unexpected tool ${req.params.name}`);
    });
    return s;
}

// Stateless Streamable HTTP host: fresh server+transport per POST, exactly
// the recommended stateless pattern (and what webparse runs).
async function start_remote(seen_auth){
    const httpd = http.createServer(async (req, res)=>{
        seen_auth.push(req.headers.authorization);
        if (req.method!=='POST')
        {
            res.writeHead(405, {allow: 'POST'}).end();
            return;
        }
        let body = '';
        for await (const chunk of req)
            body += chunk;
        const mcp = make_remote_mcp();
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
    return httpd;
}

function clean_env(extra){
    const env = {...process.env, ...extra};
    for (const key of ['GROUPS', 'TOOLS', 'RATE_LIMIT', 'POLLING_TIMEOUT'])
    {
        if (!(key in extra))
            delete env[key];
    }
    return env;
}

async function start_proxy(env){
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [server_js],
        env,
        stderr: 'pipe',
    });
    const client = new Client({name: 'test-client', version: '0.0.0'});
    await client.connect(transport);
    return client;
}

test('GROUPS=all mirrors every remote tool, forwards calls and the token',
    async t=>{
        const seen_auth = [];
        const httpd = await start_remote(seen_auth);
        const port = httpd.address().port;
        const client = await start_proxy(clean_env({
            MCP_URL: `http://127.0.0.1:${port}/mcp`,
            API_TOKEN: 'test-token',
            GROUPS: 'all',
        }));
        t.after(async ()=>{
            await client.close();
            httpd.close();
        });

        const {tools} = await client.listTools();
        const names = tools.map(tool=>tool.name);
        assert.ok(names.includes('scrape_page'));
        assert.ok(names.includes('browser_navigate'));
        assert.ok(names.includes('echo'));
        assert.ok(names.includes('session_stats'));
        const scrape = tools.find(tool=>tool.name==='scrape_page');
        assert.deepEqual(scrape.inputSchema.required, ['url']);
        // the spec-violating outputSchema was sanitized away, and the tool
        // still works
        assert.equal(scrape.outputSchema, undefined);
        const page = await client.callTool(
            {name: 'scrape_page', arguments: {url: 'https://example.com'}});
        assert.equal(page.content[0].text, 'fake page content');

        const result = await client.callTool(
            {name: 'echo', arguments: {text: 'hi'}});
        assert.equal(result.isError, undefined);
        assert.equal(result.content[0].text, 'echo:hi');
        assert.ok(seen_auth.every(a=>a==='Bearer test-token'));

        const stats = await client.callTool({name: 'session_stats'});
        assert.match(stats.content[0].text, /echo: 1 call/);
    });

test('default groups hide browser tools but session_stats stays', async t=>{
    const seen_auth = [];
    const httpd = await start_remote(seen_auth);
    const port = httpd.address().port;
    const client = await start_proxy(clean_env({
        MCP_URL: `http://127.0.0.1:${port}/mcp`,
        API_TOKEN: 'test-token',
    }));
    t.after(async ()=>{
        await client.close();
        httpd.close();
    });

    const {tools} = await client.listTools();
    const names = tools.map(tool=>tool.name);
    assert.ok(names.includes('scrape_page'));
    assert.ok(!names.includes('browser_navigate'));
    assert.ok(names.includes('session_stats'));

    // calling a hidden tool is a tool error, not a crash
    const result = await client.callTool(
        {name: 'browser_navigate', arguments: {url: 'https://example.com'}});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not enabled/);
});

test('remote tool errors surface as tool errors', async t=>{
    const seen_auth = [];
    const httpd = await start_remote(seen_auth);
    const port = httpd.address().port;
    const client = await start_proxy(clean_env({
        MCP_URL: `http://127.0.0.1:${port}/mcp`,
        API_TOKEN: 'test-token',
        TOOLS: 'browser_navigate',
    }));
    t.after(async ()=>{
        await client.close();
        httpd.close();
    });
    // fake remote throws on browser_navigate → proxied as isError result
    const result = await client.callTool(
        {name: 'browser_navigate', arguments: {url: 'https://example.com'}});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unexpected tool/);
});
