#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/

// Bundles the bridge into one file.
//
//   npm run build
//
// The SDK pulls express, hono, cors and ajv behind it, because it also ships
// server-side HTTP transports. This bridge uses the stdio server and the
// Streamable-HTTP client and nothing else, so tree-shaking drops all of it —
// which is the difference between `npx @2captcha/mcp` unpacking a ~23 MB
// dependency tree on a cold cache and unpacking one file.
//
// Output lands at the package ROOT, not in dist/. That is deliberate:
// server.js resolves its own version with `require('./package.json')`, and a
// bundle one directory down would resolve that to a file that is not there.
// Keeping the artifact beside package.json means the bundled and the source
// code behave identically instead of the bundle needing a build-time version
// injection that can silently drift from package.json.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const OUTFILE = '2captcha-mcp.mjs';
// Heavy transitive deps that this bridge must never actually reach. They come
// in behind the SDK's server-side HTTP transports, which we do not use, and
// they are where both production advisories lived (qs via express, and hono).
//
// ajv is deliberately NOT on this list. The SDK's Client and Server import it
// eagerly to validate results against outputSchema, so it is genuinely
// reachable code rather than transport baggage, and dropping it would mean
// patching the SDK.
export const MUST_DROP = ['express', 'hono', 'cors'];

export async function build({quiet = false} = {}){
    const outfile = path.join(root, OUTFILE);
    const result = await esbuild.build({
        entryPoints: [path.join(root, 'server.js')],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node18',
        // No shebang banner here: esbuild carries the entry file's own
        // shebang through, and adding one emits it twice — which parses as a
        // syntax error on line 2 rather than as a comment.
        //
        // Resolved at runtime beside the bundle, which is why the bundle
        // lives at the root. Inlining it would freeze the version into the
        // artifact and let `npm version` walk away from it.
        external: ['./package.json'],
        legalComments: 'none',
        metafile: true,
        logLevel: quiet ? 'silent' : 'info',
    });
    fs.chmodSync(outfile, 0o755);

    const inputs = Object.keys(result.metafile.inputs);
    const leaked = MUST_DROP.filter(dep=>inputs
        .some(file=>file.includes(`node_modules/${dep}/`)));
    return {outfile, bytes: fs.statSync(outfile).size, inputs, leaked};
}

// pathToFileURL, not `file://${argv[1]}`: argv[1] is a PATH, and on
// Windows that reads C:\...\build.mjs against a file:///C:/.../build.mjs
// import.meta.url, which never matches. The guard then silently fails
// closed — `npm run build` exited 0 and produced nothing, and since
// prepack is this script, `npm pack` on Windows tarballed whatever stale
// bundle was lying around. Releases run on Linux, so nothing published
// was affected; the local build was just quietly a no-op.
if (process.argv[1]
    && import.meta.url===pathToFileURL(process.argv[1]).href)
{
    const {bytes, inputs, leaked} = await build();
    console.log(`\n${OUTFILE} — ${(bytes/1024).toFixed(0)} KB from `
        +`${inputs.length} modules`);
    for (const dep of MUST_DROP)
        console.log(`  ${leaked.includes(dep) ? 'LEAKED' : 'dropped'}: ${dep}`);
    // A regression here is otherwise silent: if a future SDK reaches its HTTP
    // server transports from a path we import, express comes back and the
    // bundle quietly triples. The test suite asserts this too; failing here
    // as well means a release cannot be cut with it broken.
    if (leaked.length)
    {
        console.error(`\n${leaked.join(', ')} ended up in the bundle`);
        process.exit(1);
    }
}
