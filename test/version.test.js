'use strict'; /*jslint node:true es9:true*/
// The version is written in four files and npm enforces one of them. This is
// the gate for the other three — in npm test, so it runs in CI on every push
// and again in the release workflow before publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION_SITES, collect_versions, version_drift}
    from '../scripts/release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f=>JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

test('package.json, server.json, manifest.json and the lock agree', ()=>{
    const drift = version_drift();
    assert.equal(drift, null, `version drift:\n${drift}\n`
        +'Fix with: node scripts/release.mjs <version>');
});

test('every declared version site actually exists', ()=>{
    // Guards the reverse failure: a key gets renamed upstream, every site still
    // "agrees" because the missing ones read undefined, and the check passes
    // while silently checking nothing.
    for (const {file, where, version} of collect_versions())
        assert.equal(typeof version, 'string',
            `${file} has no version at ${where}`);
});

test('the npm package name is the same in all of them', ()=>{
    const pkg = read('package.json');
    assert.equal(read('server.json').packages[0].identifier, pkg.name);
    assert.equal(pkg.mcpName, read('server.json').name);
    assert.equal(read('package-lock.json').name, pkg.name);
});

test('the release script covers exactly the files that carry a version', ()=>{
    assert.deepEqual(Object.keys(VERSION_SITES).sort(),
        ['manifest.json', 'package-lock.json', 'package.json', 'server.json']);
});
