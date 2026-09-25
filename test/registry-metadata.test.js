'use strict'; /*jslint node:true es9:true*/
// server.json and manifest.json are the two files that decide whether this
// package is installable from anywhere other than a hand-written npx line, and
// nothing in the repo ever read them back. The registry rejects a submission
// on constraints that are invisible locally — the description cap below cost
// us a rejected publish before this test existed — and the bundle manifest
// describes a tool list that has already drifted once (35 → 37 → 40).
//
// These assert the constraints that are checkable offline. Full JSON Schema
// validation is the registry-schema job in CI, with the registry's own
// mcp-publisher, and runs again as a gate in the release workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GROUPS} from '../tool_groups.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f=>JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

// ServerDetail.description in the 2025-12-11 registry schema.
const REGISTRY_DESCRIPTION_MAX = 100;

test('server.json description fits the registry cap', ()=>{
    const {description} = read('server.json');
    assert.ok(description.length<=REGISTRY_DESCRIPTION_MAX,
        `server.json description is ${description.length} chars, the registry `
        +`allows ${REGISTRY_DESCRIPTION_MAX} — publish would be rejected`);
});

test('server.json name is reverse-DNS with exactly one slash', ()=>{
    assert.match(read('server.json').name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
});

test('the remote endpoint declares its Authorization header as a secret', ()=>{
    // Without this a client installing from the registry connects with no
    // token and gets a bare 401 instead of being asked for one.
    const [remote] = read('server.json').remotes;
    const auth = (remote.headers||[]).find(h=>h.name==='Authorization');
    assert.ok(auth, 'remotes[0] declares no Authorization header');
    assert.equal(auth.isRequired, true);
    assert.equal(auth.isSecret, true);
    // Whatever the header interpolates must be declared, or the client has
    // nothing to prompt for.
    for (const name of auth.value.matchAll(/\{([^}]+)\}/g))
        assert.ok(auth.variables?.[name[1]], `header uses {${name[1]}} but `
            +'declares no such variable');
});

test('manifest.json lists exactly the tools the groups define', ()=>{
    const declared = new Set(read('manifest.json').tools.map(t=>t.name));
    const known = new Set(Object.values(GROUPS).flatMap(g=>g.tools));
    known.add('session_stats');   // added locally by server.js, in no group
    const missing = [...known].filter(t=>!declared.has(t));
    const extra = [...declared].filter(t=>!known.has(t));
    assert.deepEqual({missing, extra}, {missing: [], extra: []});
});

test('the bundle manifest points at a file the bundle actually contains', ()=>{
    // scripts/bundle.mjs stages server.js at server/server.js; if either side
    // moves without the other, the bundle installs and then fails to start.
    const {server} = read('manifest.json');
    assert.equal(server.entry_point, 'server/server.js');
    assert.equal(server.mcp_config.command, 'node');
    assert.deepEqual(server.mcp_config.args,
        ['${__dirname}/server/server.js']);
});
