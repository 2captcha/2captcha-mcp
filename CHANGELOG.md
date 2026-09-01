# Changelog

## Unreleased

- **A free monthly allowance now comes with every account** (200 calls or $0.50 of measured spend
  per rolling 30 days, across the whole tool surface). It is metered per ACCOUNT, so `API_TOKEN`
  stays required: an IP address is not an identity, and a free tier keyed to one is a free tier
  keyed to a proxy pool. `get_account` reports what is left, so an agent can plan around the limit
  rather than discover it as a failure mid-task.
- **Two new CAPTCHA tools, in the default groups:** `detect_captcha` identifies the wall on a page
  from HTML you supply (free, never solves), and `solve_captcha_on_page` solves it and returns the
  JavaScript or cookie to apply **in your own browser**. They exist so 2Captcha adds to Playwright
  MCP and browser-use rather than competing with them — nothing has to move to our browser.
- **The browser group is now the login set (11 tools), not all 23.** `GROUPS=browser` covers
  navigate/fill/click/type/press_key, read (snapshot, get_text, get_html) and the saved-session
  tools: signing in where the login form is behind a CAPTCHA, and keeping the cookies. The full
  Playwright-shaped surface moved to `GROUPS=browser_full`. Rationale: Playwright MCP is free and
  usually already installed, the managed browser holds one live page per account so it cannot win
  on parallelism, and the 23 tool definitions measure 5,201 tokens of client context against
  2,842 for these 11 (tiktoken o200k_base over the name + description + schema block a client
  sends). Their schemas outweigh their prose, so the count was the only lever. The default
  groups cost ~7.9k tokens; opting into `browser` brings a client to ~10.7k and `browser_full` to
  ~13.1k.
- **Fixed: `discover_search_params` was in no tool group**, so every client on the default groups silently filtered out a tool the server had been advertising. It is now in `parsing`, and startup prints a note whenever the server advertises a tool no group claims — the group tables are static even though tool schemas are pulled live, so this is the one way the package *can* fall behind the service.
- `manifest.json`, `server.json` and `smithery.yaml` no longer declare the API token as required.

## 0.1.0

- Initial release: stdio MCP server bridging to the 2Captcha Web MCP service
  (`https://mcp.2captcha.com/mcp`).
- Mirrors the full remote tool surface live (parsing incl. `search_web` and
  `discover_urls`, batch jobs, browser automation, CAPTCHA solving) with
  `GROUPS` / `TOOLS` filtering; default groups `parsing,batch,captcha`,
  browser opt-in, `GROUPS=all` for everything the server advertises.
- `API_TOKEN` bearer auth (2Captcha API key or operator-issued token),
  `MCP_URL` override for self-hosted servers, `POLLING_TIMEOUT`,
  `RATE_LIMIT`, automatic reconnect, and a local `session_stats` tool.
- Tolerates spec-violating tool metadata from the server: a non-object
  `outputSchema` (e.g. a bare `anyOf` union) is dropped with a stderr note
  instead of failing the connection, so strict TS-SDK clients stay usable.
- Verified end-to-end against the hosted `mcp.2captcha.com` service and a
  local webparse dev server.
