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
    assert.ok(allowed.has('browser_screenshot'));
    assert.ok(!allowed.has('scrape_page'));
    assert.equal(allowed.size, GROUPS.BROWSER.tools.length);
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

test('group ids are unique and browser has 23 tools', ()=>{
    const ids = Object.values(GROUPS).map(g=>g.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(GROUPS.BROWSER.tools.length, 23);
    assert.equal(Object.values(GROUPS)
        .reduce((n, g)=>n+g.tools.length, 0), 37);
});
