'use strict'; /*jslint node:true es9:true*/
// End-to-end: the actual server.js spawned as a child process and driven over
// stdio against a fake remote Web MCP service. The fake, the spawn helper and
// the env scrubbing now live in _harness.mjs, which the resilience, limits,
// prompt and schema suites share.
import test from 'node:test';
import assert from 'node:assert/strict';
import {start_remote, start_proxy, clean_env, temp_cache} from './_harness.mjs';

test('GROUPS=all mirrors every remote tool, forwards calls and the token',
    async t=>{
        const remote = await start_remote();
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url,
            API_TOKEN: 'test-token',
            GROUPS: 'all',
            CACHE_DIR: temp_cache(),
        }));
        t.after(async ()=>{
            await client.close();
            await remote.close();
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
        assert.ok(remote.state.seen_auth.every(a=>a==='Bearer test-token'));

        const stats = await client.callTool({name: 'session_stats'});
        assert.match(stats.content[0].text, /echo: 1 call/);
    });

test('default groups hide browser tools but session_stats stays', async t=>{
    const remote = await start_remote();
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url,
        API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(),
    }));
    t.after(async ()=>{
        await client.close();
        await remote.close();
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
    const remote = await start_remote();
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url,
        API_TOKEN: 'test-token',
        TOOLS: 'browser_navigate',
        CACHE_DIR: temp_cache(),
    }));
    t.after(async ()=>{
        await client.close();
        await remote.close();
    });
    // fake remote throws on browser_navigate → proxied as isError result
    const result = await client.callTool(
        {name: 'browser_navigate', arguments: {url: 'https://example.com'}});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unexpected tool/);
});
