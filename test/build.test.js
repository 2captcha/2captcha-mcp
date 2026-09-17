'use strict'; /*jslint node:true es9:true*/

// The published artifact is the esbuild bundle, not server.js, so a green
// suite against the source proves less than it looks. These assert the thing
// that actually ships.
//
// The bundle exists because the SDK drags express, hono, cors and ajv behind
// it — it also ships server-side HTTP transports this bridge never uses — and
// both production advisories at the time (qs via express, and hono) arrived
// that way. Tree-shaking removes the transports, and with them the advisories
// and ~22 MB of `npx` cold start.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build, OUTFILE, MUST_DROP} from '../scripts/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'),
    'utf8'));

// One build, shared by the assertions below — esbuild is fast but not free.
const built = await build({quiet: true});

test('the HTTP server transports and their dependencies are tree-shaken out',
    ()=>{
        assert.deepEqual(built.leaked, [],
            `${built.leaked.join(', ')} ended up in the bundle. This is how `
            +'express and the qs advisory came back last time.');
    });

test('the bundle is one self-contained file of a sane size', ()=>{
    assert.ok(built.bytes>100*1024, 'suspiciously small — did it inline '
        +'anything at all?');
    assert.ok(built.bytes<2*1024*1024,
        `${(built.bytes/1024/1024).toFixed(1)} MB is far more than the ~750 KB `
        +'this should be; something large got pulled back in');
});

test('the bundle has exactly one shebang, on the first line', ()=>{
    // esbuild carries the entry file's shebang through. Adding one via
    // `banner` as well emits it twice, and the second is a syntax error
    // rather than a comment — which only shows up when someone runs it.
    const lines = fs.readFileSync(built.outfile, 'utf8').split('\n');
    assert.equal(lines[0], '#!/usr/bin/env node');
    assert.notEqual(lines[1], '#!/usr/bin/env node');
});

// NTFS has no execute bit, so the chmod in build.mjs is a no-op there and
// stat always reports 0o666 — the assertion cannot hold on Windows, and the
// CI matrix runs this suite on windows-latest. The bit only matters on the
// POSIX boxes that publish and that run `npx`, which is where this still runs.
test('the bundle is executable',
    {skip: process.platform==='win32' && 'no execute bit on NTFS'}, ()=>{
        assert.ok(fs.statSync(built.outfile).mode & 0o111,
            'npx runs this directly; without the execute bit it does not '
            +'start');
    });

test('the built bundle runs and reports the same version as package.json',
    ()=>{
        const {status, stdout} = spawnSync(process.execPath,
            [built.outfile, '--version'], {encoding: 'utf8', timeout: 30000});
        assert.equal(status, 0);
        assert.equal(stdout.trim(), pkg.version,
            'the bundle reads its version from package.json at runtime, so '
            +'this catches the bundle being built at a different version than '
            +'the one about to be published');
    });

test('package.json ships the bundle and points its bin at it', ()=>{
    assert.ok(pkg.files.includes(OUTFILE),
        `${OUTFILE} must be in "files" or the tarball has no server in it`);
    assert.equal(pkg.bin['2captcha-mcp'], `./${OUTFILE}`);
    assert.equal(pkg.scripts.prepack, 'node scripts/build.mjs',
        'without prepack the tarball would carry whatever stale bundle '
        +'happened to be on the machine');
});

test('nothing is left in runtime dependencies', ()=>{
    // The whole point of bundling: `npx @2captcha/mcp` should fetch one
    // tarball and no dependency tree. Anything here would be installed at
    // every cold start, and would show up in `npm audit` for every user.
    assert.deepEqual(pkg.dependencies, undefined);
    for (const dep of ['@modelcontextprotocol/sdk', 'zod', ...MUST_DROP])
        assert.ok(!pkg.dependencies?.[dep], `${dep} is still a runtime dep`);
});
