#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/

// Builds the MCP Bundle (.mcpb) that manifest.json has been describing since
// the first release without anything ever producing it. Output lands in
// dist/ and is attached to the GitHub Release, which is what makes the
// "install in one click" path in Claude Desktop actually exist.
//
//   npm run bundle
//
// The bundle is self-contained: server.js, tool_groups.js and the production
// node_modules go inside it, and mcp_config runs them with the host's own node.
// It deliberately does NOT shell out to `npx @2captcha/mcp` at runtime — that
// needs a network round trip and an npx on PATH, and "spawn npx ENOENT" is
// already a troubleshooting entry in our own README.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {OUTFILE} from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'build', 'mcpb');
const dist = path.join(root, 'dist');

// Pinned: the packer validates the manifest, so a new major could start
// rejecting a bundle we know is good, in the middle of a release.
const MCPB = '@anthropic-ai/mcpb@2.1.2';

const DOC_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md'];

function log(msg){
    console.log(msg);
}

function main(){
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'),
        'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root,
        'manifest.json'), 'utf8'));

    if (manifest.version!==pkg.version)
    {
        console.error(`manifest.json is ${manifest.version} but package.json `
            +`is ${pkg.version} — run: node scripts/release.mjs <version>`);
        return 1;
    }
    const built = path.join(root, OUTFILE);
    if (!fs.existsSync(built))
    {
        console.error(`${OUTFILE} is missing — run \`npm run build\` first.`);
        return 1;
    }

    fs.rmSync(stage, {recursive: true, force: true});
    fs.mkdirSync(path.join(stage, 'server'), {recursive: true});
    fs.mkdirSync(dist, {recursive: true});

    // One file, not a tree. Before esbuild this copied the whole of
    // node_modules — 2,161 files and 9.6 MB unpacked — because the server was
    // shipped as source and had to find its imports at runtime.
    fs.copyFileSync(built, path.join(stage, 'server', 'server.js'));
    for (const file of DOC_FILES)
    {
        if (fs.existsSync(path.join(root, file)))
            fs.copyFileSync(path.join(root, file), path.join(stage, file));
    }
    fs.copyFileSync(path.join(root, 'manifest.json'),
        path.join(stage, 'manifest.json'));

    // The bundle carries no imports, but it still needs `type: module` for
    // node to read it as ESM, and its own package.json to read the version
    // out of at runtime.
    fs.writeFileSync(path.join(stage, 'server', 'package.json'),
        JSON.stringify({name: pkg.name, version: pkg.version,
            type: 'module'}, null, 2)+'\n');

    const out = path.join(dist, `2captcha-mcp-${pkg.version}.mcpb`);
    fs.rmSync(out, {force: true});
    log(`packing ${out} …`);
    // npx resolves the packer at build time on a machine that already has a
    // toolchain — unlike the runtime npx this bundle exists to avoid.
    // Windows needs shell:true to run npx.cmd at all (node refuses to spawn
    // .cmd directly since CVE-2024-27980), and a shell means quoting the args
    // ourselves, or a repo path with a space in it splits.
    const win = process.platform==='win32';
    const args = ['--yes', MCPB, 'pack', stage, out];
    const res = spawnSync(win ? 'npx.cmd' : 'npx',
        win ? args.map(a=>`"${a}"`) : args,
        {stdio: 'inherit', cwd: root, shell: win});
    if (res.error)
        throw res.error;
    if (res.status!==0)
    {
        console.error(`\nmcpb pack exited ${res.status}`);
        return 1;
    }

    const mb = (fs.statSync(out).size/1024/1024).toFixed(1);
    log(`\n${path.relative(root, out)} — ${mb} MB`);
    return 0;
}

process.exit(main());
