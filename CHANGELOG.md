# Changelog

## Unreleased
- **Published to the MCP Registry.** `server.json` is now pushed by `mcp-publisher` on each
  release tag, so the server is discoverable from the client and catalogue listings that read the
  registry rather than only from npm.
- **One-click install.** The desktop-extension bundle described by `manifest.json` is now actually
  built (`npm run bundle`) and attached to each GitHub Release as `2captcha-mcp-<version>.mcpb`,
  and the README carries install deeplinks for Cursor and VS Code. The bundle is self-contained,
  so installing it does not need Node, `npx` or a config file.
- **Releases are signed with npm provenance**, so npm shows a verified-origin badge linking the
  tarball to the workflow run and commit that built it. The unaffiliated `2captcha-mcp` package
  cannot produce one.
- **`remotes` in `server.json` now declares its `Authorization` header** (as a secret), so a client
  installing from the registry is told it needs a bearer token instead of connecting and getting a
  bare `401 invalid_token`.
- **Fixed: `server.json` could not have been published at all.** The registry caps a server
  description at 100 characters and ours was 135, so the submission would have been rejected. It
  is now 99, and a test asserts the cap.
- **One version, four files.** `scripts/release.mjs` bumps `package.json`, `server.json`,
  `manifest.json` and `package-lock.json` together, and `npm test` fails if they ever disagree —
  the 0.1.2 drift below was invisible to the release workflow, which only checked `package.json`.
- CI installs with `npm ci` rather than `npm install`, which rewrote the lock in place and is how
  the version drift went unnoticed.
- Russian README (`README.ru.md`), npm/CI/registry/license badges, and install sections for 16
  clients.
- Release process documented in `docs/RELEASING.md`, including the one-time DNS setup the
  `com.2captcha` registry namespace requires.
- Five runnable examples under `examples/`, each printing what the call actually cost.

## 0.1.2 — 2026-09-02

- Version bump so the release tag matched `package.json` and the publish workflow's new version
  gate would let it through. First npm release to carry the workflow hardening below.

## 0.1.1 — 2026-09-02 (tagged, never published)

- Added the tag-vs-`package.json` version check to the publish workflow, and pinned the CI actions.
  The tag itself was cut with `package.json` still at `0.1.0`, so the check it introduced rejected
  its own release — working as designed. The content reached npm as 0.1.2 instead. No `0.1.1`
  exists on the registry.

## 0.1.0 — 2026-09-01

Initial release: a stdio MCP server bridging to the 2Captcha Web MCP service
(`https://mcp.2captcha.com/mcp`).

- Mirrors the full remote tool surface live (parsing incl. `search_web` and
  `discover_urls`, batch jobs, browser automation, CAPTCHA solving) with
  `GROUPS` / `TOOLS` filtering; default groups `parsing,batch,captcha`,
  browser opt-in, `GROUPS=all` for everything the server advertises.
- `API_TOKEN` bearer auth (2Captcha API key or operator-issued token),
  `MCP_URL` override for self-hosted servers, `POLLING_TIMEOUT`,
  `RATE_LIMIT`, automatic reconnect, and a local `session_stats` tool.
- **A free monthly allowance on every account** (200 calls or $0.50 of measured spend
  per rolling 30 days, across the whole tool surface). It is metered per ACCOUNT, so `API_TOKEN`
  stays required: an IP address is not an identity, and a free tier keyed to one is a free tier
  keyed to a proxy pool. `get_account` reports what is left, so an agent can plan around the limit
  rather than discover it as a failure mid-task.
- **Two CAPTCHA tools that work in *your* browser, in the default groups:** `detect_captcha`
  identifies the wall on a page from HTML you supply (free, never solves), and
  `solve_captcha_on_page` solves it and returns the JavaScript or cookie to apply **in your own
  browser**. They exist so 2Captcha adds to Playwright MCP and browser-use rather than competing
  with them — nothing has to move to our browser.
- **The browser group is the login set (11 tools), not all 23.** `GROUPS=browser` covers
  navigate/fill/click/type/press_key, read (snapshot, get_text, get_html) and the saved-session
  tools: signing in where the login form is behind a CAPTCHA, and keeping the cookies. The full
  Playwright-shaped surface is `GROUPS=browser_full`. Rationale: Playwright MCP is free and
  usually already installed, the managed browser holds one live page per account so it cannot win
  on parallelism, and the 23 tool definitions measure 5,201 tokens of client context against
  2,842 for these 11 (tiktoken o200k_base over the name + description + schema block a client
  sends). Their schemas outweigh their prose, so the count was the only lever. The default
  groups cost ~7.9k tokens; opting into `browser` brings a client to ~10.7k and `browser_full` to
  ~13.1k.
- `discover_search_params` is in the `parsing` group. It had been in no group at all, so every
  client on the default groups silently filtered out a tool the server was advertising. Startup
  now prints a note whenever the server advertises a tool no group claims — the group tables are
  static even though tool schemas are pulled live, so this is the one way the package *can* fall
  behind the service.
- Tolerates spec-violating tool metadata from the server: a non-object
  `outputSchema` (e.g. a bare `anyOf` union) is dropped with a stderr note
  instead of failing the connection, so strict TS-SDK clients stay usable.
- `manifest.json`, `server.json` and `smithery.yaml` do not declare the API token as required.
- Verified end-to-end against the hosted `mcp.2captcha.com` service and a
  local webparse dev server.
