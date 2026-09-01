'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS, DEFAULT_GROUPS, build_allowed_tools} from '../tool_groups.js';

test('no env → default groups (parsing+batch+captcha), no browser', ()=>{
    const {allowed, unknown_groups} = build_allowed_tools([], []);
    assert.equal(unknown_groups.length, 0);
    assert.ok(allowed.has('scrape_page'));
    assert.ok(allowed.has('parse_marketplace'));
    assert.ok(allowed.has('scrape_pages'));
    assert.ok(allowed.has('solve_captcha'));
    assert.ok(!allowed.has('browser_navigate'));
    const expected = DEFAULT_GROUPS.flatMap(id=>Object.values(GROUPS)
        .find(g=>g.id===id).tools);
    assert.equal(allowed.size, new Set(expected).size);
});

test('GROUPS=all disables filtering', ()=>{
    const {allowed} = build_allowed_tools(['all'], []);
    assert.equal(allowed, null);
});

test('explicit group selects only that group', ()=>{
    const {allowed} = build_allowed_tools(['browser'], []);
    assert.ok(allowed.has('browser_navigate'));
    assert.ok(!allowed.has('scrape_page'));
    assert.equal(allowed.size, GROUPS.BROWSER.tools.length);
});

test('browser is the login set; browser_full is everything', ()=>{
    // The narrowing is the product decision this file guards: `browser` exists
    // to sign in behind a CAPTCHA and keep the session, and paying for the
    // other twelve tools by default was a bad context trade against a free
    // Playwright MCP that already does them.
    const {allowed: login} = build_allowed_tools(['browser'], []);
    for (const tool of ['browser_navigate', 'browser_fill', 'browser_click',
        'browser_save_session', 'browser_load_session', 'browser_list_sessions'])
    {
        assert.ok(login.has(tool), tool);
    }
    for (const tool of ['browser_screenshot', 'browser_evaluate',
        'browser_save_as_pdf', 'browser_drag', 'browser_go_back'])
    {
        assert.ok(!login.has(tool), tool+' should be browser_full only');
    }
    const {allowed: full} = build_allowed_tools(['browser_full'], []);
    assert.equal(full.size, 23);
    for (const tool of GROUPS.BROWSER.tools)
        assert.ok(full.has(tool), tool+' must stay reachable via browser_full');
});

test('discover_search_params is in a group', ()=>{
    // It was advertised by the server and claimed by no group, so every default client silently
    // filtered out a working tool. server.js now prints a note for that case; this pins the fix.
    const {allowed} = build_allowed_tools([], []);
    assert.ok(allowed.has('discover_search_params'));
});

test('the page-side captcha tools ship by default', ()=>{
    // They read HTML from the caller's OWN browser, so they are useful to a
    // client that never opens ours — which is why they are not under browser.
    const {allowed} = build_allowed_tools([], []);
    assert.ok(allowed.has('detect_captcha'));
    assert.ok(allowed.has('solve_captcha_on_page'));
    assert.ok(!allowed.has('browser_navigate'));
});

test('TOOLS adds individual tools without pulling in default groups', ()=>{
    const {allowed} = build_allowed_tools([], ['scrape_page', 'get_account']);
    assert.deepEqual([...allowed].sort(), ['get_account', 'scrape_page']);
});

test('GROUPS and TOOLS combine', ()=>{
    const {allowed} = build_allowed_tools(['captcha'], ['scrape_page']);
    assert.ok(allowed.has('solve_captcha'));
    assert.ok(allowed.has('scrape_page'));
    assert.ok(!allowed.has('parse_marketplace'));
});

test('unknown group ids are reported, not fatal', ()=>{
    const {allowed, unknown_groups} = build_allowed_tools(
        ['captcha', 'bogus'], []);
    assert.deepEqual(unknown_groups, ['bogus']);
    assert.ok(allowed.has('solve_captcha'));
});

test('group ids are unique and the surface is 40 distinct tools', ()=>{
    const ids = Object.values(GROUPS).map(g=>g.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(GROUPS.BROWSER.tools.length, 11);
    assert.equal(GROUPS.BROWSER_FULL.tools.length, 23);
    // Counted DISTINCT now: the two browser groups overlap on purpose, so a
    // plain sum would double-count the eleven login tools and report 62.
    const every = new Set(Object.values(GROUPS).flatMap(g=>g.tools));
    assert.equal(every.size, 40);
});
