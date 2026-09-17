'use strict'; /*jslint node:true es9:true*/

// The three client-side guards: calls, money and concurrency.
//
// RATE_LIMIT existed and was never tested. The other two are new, and exist
// because counting calls is a weak cap for a tool that spends real money —
// one `parse_pages` over 500 URLs costs more than a hundred `scrape_page`
// calls, so a limit of "100 calls" bounds nothing that matters.

import test from 'node:test';
import assert from 'node:assert/strict';
import {start_remote, start_proxy, clean_env, temp_cache, REMOTE_TOOLS,
    PRICED_TOOL, SLOW_TOOL} from './_harness.mjs';

test('RATE_LIMIT refuses the call past the limit, and keeps serving after',
    async t=>{
        const remote = await start_remote();
        t.after(async ()=>await remote.close());
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all', RATE_LIMIT: '2/1h'}));
        t.after(async ()=>await client.close());

        for (let i = 0; i<2; i++)
        {
            const ok = await client.callTool(
                {name: 'echo', arguments: {text: `n${i}`}});
            assert.equal(ok.isError, undefined, `call ${i} should be allowed`);
        }
        const refused = await client.callTool(
            {name: 'echo', arguments: {text: 'over'}});
        assert.equal(refused.isError, true);
        assert.match(refused.content[0].text, /Rate limit exceeded: 2\/1h/);

        // The cap is a tool error, not a dead server: session_stats is local
        // and must still answer, which is how a user finds out what happened.
        const stats = await client.callTool({name: 'session_stats'});
        assert.equal(stats.isError, undefined);
        assert.match(stats.content[0].text, /Rate limit: 2\/1h/);
    });

test('an invalid RATE_LIMIT is rejected at startup rather than ignored',
    async t=>{
        await assert.rejects(async ()=>{
            const client = await start_proxy(clean_env({
                MCP_URL: 'http://127.0.0.1:1/mcp', API_TOKEN: 'test-token',
                CACHE_DIR: temp_cache(), RATE_LIMIT: 'lots'}));
            t.after(async ()=>await client.close());
        }, 'a typo in a limit must not silently mean "no limit"');
    });

test('MAX_SPEND_USD stops spending once the measured cost passes the cap',
    async t=>{
        // Each call reports $1.00. The cap is $0.50, so the first call goes
        // through (nothing has been spent yet — the price is only known once
        // the server answers) and the second is refused. Bounding the
        // overshoot to a single call is the honest guarantee here.
        const remote = await start_remote({
            tools: [...REMOTE_TOOLS, PRICED_TOOL], cost_usd: 1});
        t.after(async ()=>await remote.close());
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all', MAX_SPEND_USD: '0.50'}));
        t.after(async ()=>await client.close());

        const first = await client.callTool(
            {name: 'parse_marketplace', arguments: {url: 'https://a.test'}});
        assert.equal(first.isError, undefined);

        const second = await client.callTool(
            {name: 'parse_marketplace', arguments: {url: 'https://b.test'}});
        assert.equal(second.isError, true);
        assert.match(second.content[0].text, /Spend limit reached/);
        assert.match(second.content[0].text, /MAX_SPEND_USD=0\.50/);

        const stats = await client.callTool({name: 'session_stats'});
        assert.match(stats.content[0].text, /\$1\.000000 in the current window/);
    });

test('a free call does not count against MAX_SPEND_USD', async t=>{
    // Most of what this service does costs $0.000000 — the hidden-API rung
    // charges nothing. A spend guard that throttled those would be measuring
    // calls again, just with a dollar sign in front.
    const remote = await start_remote({
        tools: [...REMOTE_TOOLS, PRICED_TOOL], cost_usd: 0});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all', MAX_SPEND_USD: '0.01'}));
    t.after(async ()=>await client.close());

    for (let i = 0; i<4; i++)
    {
        const result = await client.callTool(
            {name: 'parse_marketplace', arguments: {url: `https://${i}.test`}});
        assert.equal(result.isError, undefined,
            `free call ${i} must not be throttled`);
    }
});

test('MAX_CONCURRENCY caps how many calls are in flight at the remote',
    async t=>{
        const remote = await start_remote({
            tools: [...REMOTE_TOOLS, SLOW_TOOL], slow_ms: 150});
        t.after(async ()=>await remote.close());
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all', MAX_CONCURRENCY: '2'}));
        t.after(async ()=>await client.close());

        // Settle the tool list first, so its round trip is not counted in the
        // high-water mark below.
        await client.listTools();
        remote.state.max_in_flight = 0;

        const results = await Promise.all(Array.from({length: 6},
            ()=>client.callTool({name: 'slow', arguments: {}})));
        assert.equal(results.filter(r=>r.isError).length, 0,
            'all six still complete — the cap queues, it does not reject');
        assert.ok(remote.state.max_in_flight<=2,
            'never more than 2 overlapping at the remote, saw '
            +`${remote.state.max_in_flight}`);
    });

test('without MAX_CONCURRENCY calls really do overlap', async t=>{
    // The control for the test above: if the fake remote serialised requests
    // on its own, the cap assertion would pass whether or not the cap works.
    const remote = await start_remote({
        tools: [...REMOTE_TOOLS, SLOW_TOOL], slow_ms: 150});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    await client.listTools();
    remote.state.max_in_flight = 0;
    await Promise.all(Array.from({length: 6},
        ()=>client.callTool({name: 'slow', arguments: {}})));
    assert.ok(remote.state.max_in_flight>2,
        'uncapped, several calls should have overlapped; saw '
        +`${remote.state.max_in_flight}`);
});
