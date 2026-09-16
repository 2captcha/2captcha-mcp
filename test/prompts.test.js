'use strict'; /*jslint node:true es9:true*/

// Prompts and resources.
//
// The bridge used to proxy tools and nothing else, and declared no
// listChanged — so a client was told the surface was static, cached it, and
// never came back. That matters more now that the tool list genuinely arrives
// after startup rather than before it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {start_remote, start_proxy, clean_env, temp_cache} from './_harness.mjs';
import {PROMPTS, render_prompt, prompt_descriptors} from '../prompts.js';

test('the server advertises listChanged on all three surfaces', async t=>{
    const remote = await start_remote();
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const caps = client.getServerCapabilities();
    assert.equal(caps.tools?.listChanged, true,
        'the tool list can now change after startup, so a client that '
        +'cached it must be told to come back');
    assert.equal(caps.prompts?.listChanged, true);
    assert.equal(caps.resources?.listChanged, true);
});

test('prompts are listed and rendered with their arguments', async t=>{
    const remote = await start_remote();
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {prompts} = await client.listPrompts();
    assert.ok(prompts.length>=6,
        `expected the recipes from examples/, got ${prompts.length}`);
    const names = prompts.map(p=>p.name);
    for (const expected of ['marketplace_to_table', 'sitemap_to_dataset',
        'captcha_in_my_browser', 'login_and_save_session',
        'compare_across_markets', 'what_did_it_cost'])
    {
        assert.ok(names.includes(expected), `missing prompt ${expected}`);
    }

    const got = await client.getPrompt({name: 'marketplace_to_table',
        arguments: {url: 'https://shop.test/search?q=x'}});
    const text = got.messages[0].content.text;
    assert.match(text, /https:\/\/shop\.test/);
    assert.match(text, /parse_marketplace/);
    assert.match(text, /include_meta/);
});

test('an optional argument changes the rendered prompt', ()=>{
    const plain = render_prompt('marketplace_to_table',
        {url: 'https://a.test'}).messages[0].content.text;
    const free = render_prompt('marketplace_to_table',
        {url: 'https://a.test', free_only: 'true'}).messages[0].content.text;
    assert.doesNotMatch(plain, /api_tier_only/);
    assert.match(free, /api_tier_only/,
        'free_only must actually reach the instruction, not just the schema');
});

test('a missing required argument is an error, not a broken prompt', ()=>{
    assert.throws(()=>render_prompt('marketplace_to_table', {}),
        /missing required argument\(s\): url/);
    // Rendering "Parse undefined into a table" would be worse than failing:
    // the agent would go and do it.
});

test('an unknown prompt is reported rather than silently empty', async t=>{
    const remote = await start_remote();
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    await assert.rejects(
        async ()=>await client.getPrompt({name: 'no_such_prompt'}),
        /Unknown prompt/);
});

test('every declared prompt renders from its own required arguments', ()=>{
    // Guards the case where a prompt is added to the list and its builder
    // references an argument that was never declared, so the client offers a
    // form that cannot produce a working prompt.
    for (const prompt of PROMPTS)
    {
        const args = Object.fromEntries((prompt.arguments || [])
            .filter(a=>a.required).map(a=>[a.name, `value-for-${a.name}`]));
        const rendered = render_prompt(prompt.name, args);
        const text = rendered.messages[0].content.text;
        assert.ok(text.length>50, `${prompt.name} rendered almost nothing`);
        assert.doesNotMatch(text, /undefined/,
            `${prompt.name} references an argument it does not declare`);
        for (const arg of (prompt.arguments || []).filter(a=>a.required))
        {
            assert.ok(text.includes(`value-for-${arg.name}`),
                `${prompt.name} declares ${arg.name} but never uses it`);
        }
    }
});

test('prompt descriptors do not leak the internal builder', ()=>{
    // `build` is a function; sending it over the wire would silently drop to
    // null and the client would show an empty prompt.
    for (const descriptor of prompt_descriptors())
    {
        assert.equal(descriptor.build, undefined);
        assert.equal(typeof descriptor.name, 'string');
        assert.ok(Array.isArray(descriptor.arguments));
    }
});

test('remote prompts are merged in behind the local ones', async t=>{
    const remote = await start_remote({prompts: true});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {prompts} = await client.listPrompts();
    const names = prompts.map(p=>p.name);
    assert.ok(names.includes('remote_recipe'),
        'a prompt the service advertises must reach the client');
    assert.ok(names.includes('marketplace_to_table'));
});

test('resources are proxied when the remote has them', async t=>{
    const remote = await start_remote({resources: true});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {resources} = await client.listResources();
    assert.equal(resources.length, 1);
    assert.equal(resources[0].uri, 'docs://TOOLS.md');

    const read = await client.readResource({uri: 'docs://TOOLS.md'});
    assert.match(read.contents[0].text, /cost table/);
});

test('a remote with no prompts or resources degrades to empty, not an error',
    async t=>{
        const remote = await start_remote();
        t.after(async ()=>await remote.close());
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all'}));
        t.after(async ()=>await client.close());

        const {resources} = await client.listResources();
        assert.deepEqual(resources, []);
        // Local prompts still work even though the remote advertises none.
        const {prompts} = await client.listPrompts();
        assert.ok(prompts.length>=6);
    });

test('prompts still work with the remote unreachable', async t=>{
    // They are local recipes, so being offline is no reason to hide them —
    // and reading one is how a user finds out what the tools are for.
    const client = await start_proxy(clean_env({
        MCP_URL: 'http://127.0.0.1:1/mcp', API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache()}));
    t.after(async ()=>await client.close());

    const {prompts} = await client.listPrompts();
    assert.ok(prompts.length>=6);
    const got = await client.getPrompt({name: 'what_did_it_cost',
        arguments: {url: 'https://x.test'}});
    assert.match(got.messages[0].content.text, /https:\/\/x\.test/);
});
