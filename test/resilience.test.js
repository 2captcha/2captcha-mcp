'use strict'; /*jslint node:true es9:true*/

// What happens when the remote is not there, or is there but unhappy.
//
// Every test here covers a failure that used to take the whole server down at
// startup: `fail()` + `process.exit(1)` on any connect error meant a laptop
// waking on a dead Wi-Fi came back with the server marked broken in Claude
// Desktop, and no amount of network returning would bring it back without the
// user restarting the client by hand.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {start_remote, start_proxy, clean_env, temp_cache, until}
    from './_harness.mjs';

// A port nothing is listening on. Connection refused is immediate, which
// keeps these tests fast, and is the same class of error as a dead network as
// far as the bridge is concerned.
const DEAD_URL = 'http://127.0.0.1:1/mcp';

test('an unreachable remote does not stop the server starting', async t=>{
    const cache = temp_cache();
    const client = await start_proxy(clean_env({
        MCP_URL: DEAD_URL, API_TOKEN: 'test-token', CACHE_DIR: cache}));
    t.after(async ()=>await client.close());

    // The connect() above already proves the process did not exit — before
    // this change it did, and the client saw a closed pipe instead.
    const {tools} = await client.listTools();
    assert.deepEqual(tools.map(tool=>tool.name), ['session_stats'],
        'with no cache and no network there is nothing to serve but the '
        +'local tool, and that is still a working server');

    const stats = await client.callTool({name: 'session_stats'});
    assert.equal(stats.isError, undefined);
});

test('a tool call against an unreachable remote is a tool error, not a crash',
    async t=>{
        const cache = temp_cache();
        const client = await start_proxy(clean_env({
            MCP_URL: DEAD_URL, API_TOKEN: 'test-token', CACHE_DIR: cache,
            TOOLS: 'scrape_page'}));
        t.after(async ()=>await client.close());

        const result = await client.callTool(
            {name: 'scrape_page', arguments: {url: 'https://example.com'}});
        assert.equal(result.isError, true);
        // Still alive afterwards — the error was returned, not thrown out of
        // the process.
        const stats = await client.callTool({name: 'session_stats'});
        assert.equal(stats.isError, undefined);
    });

test('the tool list is cached to disk and served when the remote is gone',
    async t=>{
        const cache = temp_cache();
        const remote = await start_remote();

        const first = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
            GROUPS: 'all'}));
        const live = await first.listTools();
        assert.ok(live.tools.some(tool=>tool.name==='scrape_page'));
        await first.close();

        const written = fs.readdirSync(cache).filter(f=>f.startsWith('tools-'));
        assert.equal(written.length, 1, 'one cache file, keyed by endpoint');
        const saved = JSON.parse(
            fs.readFileSync(path.join(cache, written[0]), 'utf8'));
        assert.ok(saved.tools.some(tool=>tool.name==='scrape_page'));
        assert.equal(saved.url, remote.url);
        // The token must never end up on disk.
        assert.doesNotMatch(JSON.stringify(saved), /test-token/);

        // Now take the remote away entirely and start again against the same
        // endpoint. This is the laptop-woke-without-wifi case.
        await remote.close();
        const second = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
            GROUPS: 'all'}));
        t.after(async ()=>await second.close());

        const offline = await second.listTools();
        const names = offline.tools.map(tool=>tool.name);
        assert.ok(names.includes('scrape_page'),
            'the cached schemas are served with no network at all');
        assert.ok(names.includes('echo'));
        assert.ok(names.includes('session_stats'));
    });

test('the cache is keyed by endpoint, so a self-hosted URL gets its own',
    async t=>{
        const cache = temp_cache();
        const a = await start_remote();
        const b = await start_remote({tools: [
            {name: 'only_on_b', description: 'b',
                inputSchema: {type: 'object', properties: {}}}]});
        t.after(async ()=>{
            await a.close();
            await b.close();
        });

        for (const remote of [a, b])
        {
            const client = await start_proxy(clean_env({
                MCP_URL: remote.url, API_TOKEN: 'test-token',
                CACHE_DIR: cache, GROUPS: 'all'}));
            await client.listTools();
            await client.close();
        }
        assert.equal(
            fs.readdirSync(cache).filter(f=>f.startsWith('tools-')).length, 2,
            'two endpoints, two cache files — one must never serve the '
            +'other\'s tool list back');
    });

test('a rejected token still fails loudly and exits', async t=>{
    // The one case where exiting is right: a 401 is deterministic, it will
    // not fix itself on the next call, and a server that stays up pretending
    // to work would surface it as a mysterious tool error much later.
    const cache = temp_cache();
    const remote = await start_remote({auth: 'the-right-token'});
    t.after(async ()=>await remote.close());

    const seen = [];
    let closed = false;
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'the-wrong-token', CACHE_DIR: cache}),
    {on_stderr: line=>seen.push(line)});
    client.onclose = ()=>{
        closed = true;
    };

    await until(()=>closed || seen.some(l=>/Authentication to/.test(l)));
    assert.ok(seen.some(l=>/Authentication to .* failed — check API_TOKEN/
        .test(l)), `expected an auth diagnostic, got:\n${seen.join('\n')}`);
});

test('5xx is retried with backoff and the call still succeeds', async t=>{
    const cache = temp_cache();
    // Two failures then normal service. With no retry the first list would
    // surface the 503 and the tool list would come back empty.
    const remote = await start_remote({
        script: [{status: 503}, {status: 502}]});
    t.after(async ()=>await remote.close());

    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
        GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {tools} = await client.listTools();
    assert.ok(tools.some(tool=>tool.name==='scrape_page'),
        'the bridge rode out 503 then 502 and got the real list');
    assert.ok(remote.state.posts>=3, 'it actually retried rather than '
        +`succeeding first time (posts: ${remote.state.posts})`);
});

test('429 is retried and Retry-After is honoured', async t=>{
    const cache = temp_cache();
    const remote = await start_remote({
        script: [{status: 429, retry_after: 1}]});
    t.after(async ()=>await remote.close());

    const started = Date.now();
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
        GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {tools} = await client.listTools();
    const waited = Date.now()-started;
    assert.ok(tools.some(tool=>tool.name==='scrape_page'));
    // Retry-After: 1 means one second, not the 500 ms the backoff would have
    // picked on its own.
    assert.ok(waited>=900,
        `expected to wait out Retry-After: 1, waited ${waited}ms`);
});

test('a retry storm is bounded rather than hammering the endpoint',
    async t=>{
        const cache = temp_cache();
        // More failures than MAX_ATTEMPTS, so the bridge gives up and reports
        // instead of retrying forever.
        const remote = await start_remote({script: Array.from({length: 20},
            ()=>({status: 503}))});
        t.after(async ()=>await remote.close());

        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
            GROUPS: 'all'}));
        t.after(async ()=>await client.close());

        const {tools} = await client.listTools();
        assert.deepEqual(tools.map(tool=>tool.name), ['session_stats'],
            'gave up and served what it had');
        assert.ok(remote.state.posts<=8,
            `bounded retries, not a storm (posts: ${remote.state.posts})`);
    });

test('tools/list is served from a TTL cache instead of a round trip each time',
    async t=>{
        const cache = temp_cache();
        const remote = await start_remote();
        t.after(async ()=>await remote.close());

        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token', CACHE_DIR: cache,
            GROUPS: 'all'}));
        t.after(async ()=>await client.close());

        await client.listTools();
        const after_first = remote.state.tool_lists;
        for (let i = 0; i<5; i++)
            await client.listTools();
        assert.equal(remote.state.tool_lists, after_first,
            'five more list calls inside the TTL cost zero round trips; '
            +'before this, clients paid a 30s-timeout network hop on every '
            +'turn');
    });
