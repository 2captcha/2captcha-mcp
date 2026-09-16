'use strict'; /*jslint node:true es9:true*/

// The command-line surface, and the paths that end in a deliberate exit.
//
// These run server.js directly rather than through an MCP client, because
// what is being asserted is what a person sees in a terminal — including the
// two cases where refusing to start is the correct behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {SERVER_JS, clean_env, temp_cache} from './_harness.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function run(args = [], env = {}){
    return spawnSync(process.execPath, [SERVER_JS, ...args], {
        env: clean_env(env), encoding: 'utf8', input: '', timeout: 30000});
}

test('--version prints the version to stdout and exits 0', ()=>{
    const {status, stdout} = run(['--version']);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), pkg.version);
});

test('-v is the same as --version', ()=>{
    assert.equal(run(['-v']).stdout.trim(), pkg.version);
});

test('--help documents every env var the server actually reads', ()=>{
    const {status, stdout} = run(['--help']);
    assert.equal(status, 0);
    // A flag that exists and is undocumented is a flag nobody uses.
    for (const name of ['API_TOKEN', 'GROUPS', 'TOOLS', 'MCP_URL',
        'POLLING_TIMEOUT', 'RATE_LIMIT', 'MAX_SPEND_USD', 'MAX_CONCURRENCY',
        'CACHE_DIR'])
    {
        assert.match(stdout, new RegExp(name), `--help omits ${name}`);
    }
});

test('--help and --version work with no API_TOKEN set', ()=>{
    // The whole point: the machine asking "what did I just install?" is
    // exactly the machine that has not configured a token yet.
    assert.equal(run(['--help']).status, 0);
    assert.equal(run(['--version']).status, 0);
});

test('the CLI writes to stdout, and the server writes only to stderr', ()=>{
    // stdout IS the MCP transport. A diagnostic there corrupts the protocol
    // stream and the client disconnects with no useful error.
    const help = run(['--help']);
    assert.ok(help.stdout.length>100);
    assert.equal(help.stderr, '');

    const serving = run([], {MCP_URL: 'http://127.0.0.1:1/mcp',
        API_TOKEN: 'x', CACHE_DIR: temp_cache()});
    assert.match(serving.stderr, /ready on stdio/);
    assert.equal(serving.stdout, '',
        'nothing but MCP frames may ever reach stdout');
});

test('no API_TOKEN against the hosted service is a clean, actionable failure',
    ()=>{
        const {status, stderr} = run([], {CACHE_DIR: temp_cache()});
        assert.equal(status, 1, 'refusing to start is right here: the free '
            +'allowance is metered per account, so there is no anonymous mode '
            +'to fall back to');
        assert.match(stderr, /Cannot run without the API_TOKEN env var/);
        assert.match(stderr, /2captcha\.com\/setting/,
            'tell the user where to get one');
    });

test('no API_TOKEN against a self-hosted MCP_URL warns but still starts', ()=>{
    // A self-hosted server may legitimately run open, so this one is a
    // warning rather than a refusal.
    const {stderr} = run([], {MCP_URL: 'http://127.0.0.1:1/mcp',
        CACHE_DIR: temp_cache()});
    assert.match(stderr, /warning: no API_TOKEN set/);
    assert.match(stderr, /ready on stdio/, 'it started anyway');
});

test('an unknown tool group warns and names the valid ones', ()=>{
    const {stderr} = run([], {MCP_URL: 'http://127.0.0.1:1/mcp',
        API_TOKEN: 'x', GROUPS: 'parsing,nonsense',
        CACHE_DIR: temp_cache()});
    assert.match(stderr, /unknown tool group "nonsense"/);
    assert.match(stderr, /parsing, batch, browser, browser_full, captcha, all/,
        'a warning that does not say what the valid values are is a riddle');
    assert.match(stderr, /ready on stdio/,
        'one bad group id must not take the server down');
});

test('an invalid MAX_SPEND_USD is refused at startup', ()=>{
    const {status, stderr} = run([], {MCP_URL: 'http://127.0.0.1:1/mcp',
        API_TOKEN: 'x', MAX_SPEND_USD: 'plenty', CACHE_DIR: temp_cache()});
    assert.notEqual(status, 0);
    assert.match(stderr, /MAX_SPEND_USD/);
});

test('an invalid MAX_CONCURRENCY is refused at startup', ()=>{
    const {status, stderr} = run([], {MCP_URL: 'http://127.0.0.1:1/mcp',
        API_TOKEN: 'x', MAX_CONCURRENCY: '0', CACHE_DIR: temp_cache()});
    assert.notEqual(status, 0);
    assert.match(stderr, /MAX_CONCURRENCY/);
});
