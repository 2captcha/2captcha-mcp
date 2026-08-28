# Changelog

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
