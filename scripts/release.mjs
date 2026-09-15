#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/

// The version of this package lives in four files, and npm only enforces one of
// them. package-lock.json is the nasty one: any `npm install` rewrites it, and
// the release workflow's tag check only ever looked at package.json, so a stale
// lock sailed straight through the one gate there was.
//
//   node scripts/release.mjs 0.1.3   bump every file to 0.1.3
//   node scripts/release.mjs --check verify they already agree (CI, npm test)
//
// A bump also opens a dated section in CHANGELOG.md, moving whatever sits under
// `## Unreleased` into it, because a version nobody wrote a line for is a
// version nobody can review.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// file → the JSON paths inside it that carry the package version. Each entry is
// an array of keys; '' is a real key in package-lock's `packages` map (it means
// "the root package"), which is why these are arrays and not dotted strings.
export const VERSION_SITES = {
    'package.json': [['version']],
    'server.json': [['version'], ['packages', 0, 'version']],
    'manifest.json': [['version']],
    'package-lock.json': [['version'], ['packages', '', 'version']],
};

function read_json(file){
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function get_in(obj, keys){
    return keys.reduce((o, k)=>o===undefined || o===null ? o : o[k], obj);
}

function set_in(obj, keys, value){
    const last = keys[keys.length-1];
    const parent = keys.slice(0, -1).reduce((o, k)=>o[k], obj);
    parent[last] = value;
}

// Every version currently on disk, as [file, json-path, value] triples.
export function collect_versions(){
    const found = [];
    for (const [file, sites] of Object.entries(VERSION_SITES))
    {
        const json = read_json(file);
        for (const keys of sites)
            found.push({file, where: keys.join('.') || 'version',
                version: get_in(json, keys)});
    }
    return found;
}

// null when they all agree, otherwise a human-readable report of the drift.
export function version_drift(){
    const found = collect_versions();
    const versions = new Set(found.map(f=>f.version));
    if (versions.size<=1)
        return null;
    const pkg = found[0].version;
    return found.filter(f=>f.version!==pkg)
        .map(f=>`  ${f.file} (${f.where}) is ${f.version}, `
            +`package.json is ${pkg}`).join('\n');
}

// Rewrites in place, preserving each file's own indent — package.json is
// 4-space here and the rest are 2-space, and a release should not show up in
// review as a whole-file reformat.
function write_version(file, version){
    const raw = fs.readFileSync(path.join(root, file), 'utf8');
    const indent = /\n(\s+)"/.exec(raw)?.[1].length || 2;
    const json = JSON.parse(raw);
    for (const keys of VERSION_SITES[file])
    {
        if (get_in(json, keys)===undefined)
            continue;
        set_in(json, keys, version);
    }
    const eol = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(path.join(root, file),
        JSON.stringify(json, null, indent)+eol);
}

function today(){
    return new Date().toISOString().slice(0, 10);
}

// `## Unreleased` becomes `## <version> — <date>`, and a fresh empty Unreleased
// is left on top for the next cycle. The "already released" test is a plain
// string compare on purpose: a version is dots and digits, and building a
// regex out of one invites exactly the escaping bug this had.
function open_changelog_section(version){
    const file = path.join(root, 'CHANGELOG.md');
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.split('\n').some(l=>l===`## ${version}` || l.startsWith(`## ${version} `)))
        return `CHANGELOG.md already has a ${version} section, left alone`;
    if (!/^## Unreleased\s*$/m.test(raw))
        return 'CHANGELOG.md has no `## Unreleased` section — add the notes by hand';
    fs.writeFileSync(file, raw.replace(/^## Unreleased\s*$/m,
        `## Unreleased\n\n## ${version} — ${today()}`));
    return `CHANGELOG.md: Unreleased → ${version}`;
}

function main(argv){
    const arg = argv[2];
    if (!arg || arg==='--help' || arg==='-h')
    {
        console.log('usage: node scripts/release.mjs <version>|--check');
        return 0;
    }
    if (arg==='--check')
    {
        const drift = version_drift();
        if (!drift)
        {
            console.log(`versions agree: ${read_json('package.json').version}`);
            return 0;
        }
        console.error('version drift:\n'+drift
            +'\n\nRun: node scripts/release.mjs <version>');
        return 1;
    }
    const version = arg.replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))
    {
        console.error(`not a semver version: ${arg}`);
        return 1;
    }
    for (const file of Object.keys(VERSION_SITES))
    {
        write_version(file, version);
        console.log(`${file} → ${version}`);
    }
    console.log(open_changelog_section(version));
    console.log(`\nNext: review the diff, commit, then\n`
        +`  git tag v${version} && git push origin main --tags`);
    return 0;
}

// Only when run directly — the tests import version_drift() from here.
if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
    process.exit(main(process.argv));
