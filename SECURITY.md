# Security policy

## Reporting a vulnerability

Report privately — do not open a public issue.

- **Preferred:** [open a draft advisory](https://github.com/2captcha/2captcha-mcp/security/advisories/new)
  on this repository.
- **Email:** support@2captcha.com with `2captcha-mcp security` in the subject.

Please include the version (`npx @2captcha/mcp --version`), your OS and Node
version, what an attacker gains, and the smallest reproduction you have.

We aim to acknowledge within 3 working days and to ship a fix or a written
assessment within 30 days. Tell us if you have a disclosure deadline and we
will work to it. We will credit you in the advisory and the changelog unless
you ask us not to.

## Supported versions

Only the latest published version of `@2captcha/mcp` on npm receives fixes.
There are no long-term support branches.

## What this package is

A stdio bridge to the hosted service at `https://mcp.2captcha.com/mcp`. It
holds no data of its own and runs no network listener. That shapes what is in
scope here:

**In scope**

- Anything that leaks `API_TOKEN` — into logs, into stdout, into the offline
  tool cache, into an error message, or to a host other than `MCP_URL`.
- Anything that writes to stdout other than MCP protocol frames. stdout *is*
  the transport; injecting into it is a protocol-level attack on the client.
- Tool metadata from the remote being able to execute code locally, rather
  than being passed through as data.
- Path traversal or privilege issues in the offline cache (`CACHE_DIR`).
- A dependency advisory that is actually reachable from this code. The bundle
  is built with `npm run build`; `npm audit` on a clone covers the build
  toolchain as well as what ships.

**Not in scope here**

- Vulnerabilities in the hosted service itself — report those to
  support@2captcha.com, they are a different system.
- What an *agent* chooses to do with the tools. This bridge deliberately
  passes tool calls through; deciding that a model should not have been
  allowed to scrape something is a policy question for the client, not a flaw
  in the bridge.
- The unaffiliated `2captcha-mcp` package on npm. It is not ours. The official
  package is `@2captcha/mcp`, published with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements) —
  check for the "Built and signed" badge on the package page.

## Handling your token

`API_TOKEN` is sent as a bearer token to `MCP_URL` and to nowhere else. It is
never written to the offline cache, which holds only tool schemas. If you
believe a token has leaked, rotate it at https://2captcha.com/setting.
