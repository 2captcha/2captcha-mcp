'use strict'; /*jslint node:true es9:true*/

// Tool metadata sanitizing.
//
// The SDK's listTools() hard-rejects a list where any single tool strays from
// the spec, so one bad schema on the server would blank the entire surface
// rather than one tool. That happened for real: Pydantic renders a `A | B`
// return type as a bare `anyOf` with no top-level "type", and the deployed
// service emitted it.
//
// Asserted end to end rather than by unit-testing sanitize_tool, because the
// thing that matters is what a strict client sees — a function that returns a
// tidy object while the connection dies is not a passing test.

import test from 'node:test';
import assert from 'node:assert/strict';
import {start_remote, start_proxy, clean_env, temp_cache} from './_harness.mjs';

const BROKEN = [
    // The real case: union return type, no top-level type.
    {name: 'bare_anyof', description: 'union return',
        inputSchema: {type: 'object', properties: {}},
        outputSchema: {anyOf: [{type: 'object'}, {type: 'string'}]}},
    // outputSchema of the wrong JSON type entirely.
    {name: 'string_output_schema', description: 'nonsense schema',
        inputSchema: {type: 'object', properties: {}},
        outputSchema: 'not an object'},
    // outputSchema present but a non-object type.
    {name: 'array_output_schema', description: 'array schema',
        inputSchema: {type: 'object', properties: {}},
        outputSchema: {type: 'array', items: {type: 'string'}}},
    // No inputSchema at all.
    {name: 'no_input_schema', description: 'missing input schema'},
    // inputSchema of the wrong type.
    {name: 'bad_input_schema', description: 'input schema is a string',
        inputSchema: 'nope'},
    // inputSchema that is an object but not type "object".
    {name: 'array_input_schema', description: 'array input',
        inputSchema: {type: 'array'}},
    // A healthy tool, last, to prove the others did not poison the list.
    {name: 'healthy', description: 'perfectly fine',
        inputSchema: {type: 'object', properties: {q: {type: 'string'}},
            required: ['q']},
        outputSchema: {type: 'object', properties: {a: {type: 'string'}}}},
];

test('every malformed schema is repaired and the whole list survives',
    async t=>{
        const remote = await start_remote({tools: BROKEN});
        t.after(async ()=>await remote.close());
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all'}));
        t.after(async ()=>await client.close());

        // listTools() here is the SDK's own strict parse. If sanitizing
        // missed one, this call rejects and every tool is lost.
        const {tools} = await client.listTools();
        const by_name = Object.fromEntries(tools.map(tool=>[tool.name, tool]));

        for (const broken of BROKEN)
            assert.ok(by_name[broken.name], `${broken.name} went missing`);

        // Unusable outputSchemas are dropped, not guessed at.
        for (const name of ['bare_anyof', 'string_output_schema',
            'array_output_schema'])
        {
            assert.equal(by_name[name].outputSchema, undefined,
                `${name} should have had its outputSchema removed`);
        }

        // A missing or wrong inputSchema becomes the empty object schema,
        // which is valid and callable rather than absent.
        for (const name of ['no_input_schema', 'bad_input_schema',
            'array_input_schema'])
        {
            assert.deepEqual(by_name[name].inputSchema,
                {type: 'object', properties: {}},
                `${name} should have a usable input schema`);
        }

        // The good tool is untouched — sanitizing must not flatten a valid
        // schema, or every tool would lose its arguments.
        assert.deepEqual(by_name.healthy.inputSchema.required, ['q']);
        assert.equal(by_name.healthy.outputSchema.type, 'object');
    });

test('a sanitized tool is still callable', async t=>{
    const remote = await start_remote({tools: [
        {name: 'echo', description: 'echo args back',
            inputSchema: {type: 'object',
                properties: {text: {type: 'string'}}},
            outputSchema: {anyOf: [{type: 'object'}, {type: 'string'}]}},
    ]});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const result = await client.callTool(
        {name: 'echo', arguments: {text: 'hi'}});
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, 'echo:hi');
});

test('entries with no usable name are dropped rather than served', async t=>{
    const remote = await start_remote({tools: [
        null,
        {description: 'no name at all', inputSchema: {type: 'object'}},
        {name: 42, description: 'name is not a string'},
        {name: 'real', description: 'fine',
            inputSchema: {type: 'object', properties: {}}},
    ]});
    t.after(async ()=>await remote.close());
    const client = await start_proxy(clean_env({
        MCP_URL: remote.url, API_TOKEN: 'test-token',
        CACHE_DIR: temp_cache(), GROUPS: 'all'}));
    t.after(async ()=>await client.close());

    const {tools} = await client.listTools();
    assert.deepEqual(tools.map(tool=>tool.name).sort(),
        ['real', 'session_stats']);
});

test('the note about a bad schema is printed once, not per list call',
    async t=>{
        const remote = await start_remote({tools: BROKEN});
        t.after(async ()=>await remote.close());
        const lines = [];
        const client = await start_proxy(clean_env({
            MCP_URL: remote.url, API_TOKEN: 'test-token',
            CACHE_DIR: temp_cache(), GROUPS: 'all'}),
        {on_stderr: line=>lines.push(line)});
        t.after(async ()=>await client.close());

        await client.listTools();
        const notes = lines.filter(l=>/non-object outputSchema/.test(l));
        const per_tool = new Set(notes.map(l=>l.match(/tool "([^"]+)"/)?.[1]));
        assert.equal(notes.length, per_tool.size,
            'a client re-lists tools constantly; repeating this note on every '
            +`refresh would bury the log:\n${notes.join('\n')}`);
    });
