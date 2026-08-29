<div align="center">

<h1>2Captcha MCP</h1>

<p><strong>Web scraping with anti-bot bypass, marketplace parsing to structured JSON, browser automation, and CAPTCHA solving for AI agents over the Model Context Protocol.</strong></p>
<p>Works with Claude, Cursor, coding agents, and any MCP-compatible client.</p>

<p>
  <a href="#quick-start">Quick Start</a> •
  <a href="#tool-selection-groups">Tool Groups</a> •
  <a href="#tools-reference-37-tools">Tools</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

</div>

> [!IMPORTANT]
> The official 2Captcha MCP package is **`@2captcha/mcp`** (published under the [@2captcha](https://www.npmjs.com/org/2captcha) npm organization). The unscoped `2captcha-mcp` package on npm is **not affiliated with 2Captcha** — don't put your API key into it.

---

## Overview

The 2Captcha MCP server gives AI agents real-time access to web data that blocks ordinary HTTP clients. It exposes **37 tools** covering:

- **Web search** — ranked organic results (title, URL, snippet) for a query
- **Page scraping** — any URL as clean Markdown or raw HTML. Every request runs through a tiered anti-bot ladder: hidden JSON APIs, a TLS-impersonating HTTP client, rotating residential proxies, and a managed browser with CAPTCHA solving — escalating only as far as the page requires, so easy pages stay fast and cheap.
- **Marketplace parsing** — product pages and search listings as structured JSON (title, price, rating, seller, stock, offers). Deterministic tiers first (hidden marketplace APIs, JSON-LD, learned selectors); an LLM extraction pass only when they miss.
- **Structured extraction** — any URL or raw text plus your own JSON Schema in, matching JSON out.
- **Batch jobs** — run the scraping/parsing tools over many URLs as a background job: submit, poll, cancel.
- **Browser automation** — navigate, click, type, snapshot, screenshot, and read pages in a real managed browser session, with saved login states.
- **CAPTCHA solving** — solve any CAPTCHA type 2Captcha supports (reCAPTCHA, Turnstile, hCaptcha, images, …), report bad solutions for refunds, check your balance.

Two deployment options: the **hosted remote server** (one URL, no installation) or a **local instance** via `npx @2captcha/mcp`.

---

## Quick Start

### Hosted server — no installation

Add the URL to your MCP client with an `Authorization` header:

```
URL:    https://mcp.2captcha.com/mcp
Header: Authorization: Bearer YOUR_API_TOKEN
```

Your token is your **2Captcha API key** ([account settings](https://2captcha.com/setting)) or the bearer token your server operator issued.

### Local server via npx

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>"
      }
    }
  }
}
```

The local server mirrors the hosted tool surface over stdio — use it with clients that can't send auth headers or only launch local MCP servers.

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport http 2captcha https://mcp.2captcha.com/mcp \
  --header "Authorization: Bearer YOUR_API_TOKEN"
```

Or locally:

```bash
claude mcp add 2captcha -e API_TOKEN=YOUR_API_TOKEN -- npx @2captcha/mcp
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit the config file (macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`) and restart the app:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>VS Code (GitHub Copilot)</b></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>MCP Inspector (explore the tools by hand)</b></summary>

```bash
API_TOKEN=YOUR_API_TOKEN npx @modelcontextprotocol/inspector npx @2captcha/mcp
```

Or connect the Inspector directly to `https://mcp.2captcha.com/mcp` (transport **Streamable HTTP**, header `Authorization: Bearer YOUR_API_TOKEN`).

</details>

### Try it

Ask your agent:

> Parse https://www.wildberries.ru/catalog/0/search.aspx?search=coffee as search results and list the five cheapest items.

> Scrape https://news.ycombinator.com and summarize the top stories.

> What's my 2Captcha balance?

---

## Tool Selection: Groups

By default the server exposes the **parsing, batch, and captcha** groups (14 tools). Browser automation (23 more tools) is opt-in — it's a lot of client context.

| Group | Tools | What it's for |
|---|---|---|
| `parsing` | `scrape_page`, `search_web`, `discover_urls`, `parse_marketplace`, `extract`, `get_account` | Search the web, scrape pages, discover a site's URLs, parse marketplaces, extract structured JSON |
| `batch` | `scrape_pages`, `parse_pages`, `get_job`, `cancel_job` | The parsing tools over many URLs as background jobs |
| `browser` | 23 `browser_*` tools | Drive a real managed browser step by step |
| `captcha` | `list_captcha_types`, `solve_captcha`, `captcha_report`, `captcha_balance` | Solve any CAPTCHA type 2Captcha supports |
| `all` | everything the server advertises | No filtering — includes tools added server-side in the future |

### Configuration examples

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": {
        "API_TOKEN": "YOUR_API_TOKEN",
        "GROUPS": "parsing,browser"
      }
    }
  }
}
```

Individual tools, no groups:

```json
"env": {
  "API_TOKEN": "YOUR_API_TOKEN",
  "TOOLS": "scrape_page,solve_captcha"
}
```

`GROUPS` and `TOOLS` combine (union). Tool availability is ultimately the server's decision — a group named here only filters what the server actually advertises.

---

## Tools Reference (37 Tools)

### Which tool to use

- **Looking for pages to scrape?** → `search_web` (query → ranked URLs)
- **Just need the page content?** → `scrape_page` (no LLM, cheapest)
- **Need a URL inventory before batching?** → `discover_urls` (robots.txt + sitemaps, no crawling)
- **Product or search page → JSON?** → `parse_marketplace` (deterministic tiers first, LLM fallback)
- **Your own schema from any page/text?** → `extract` (always one LLM call, or cache)
- **Many URLs?** → `scrape_pages` / `parse_pages` + `get_job`
- **Interactive site (login, infinite scroll, form)?** → the `browser_*` tools
- **A CAPTCHA token for your own automation?** → `list_captcha_types` then `solve_captcha`

### Parsing

| Tool | Description | Costs money? |
|---|---|---|
| `scrape_page` | Fetch a page and return its readable content as markdown (or raw HTML with `clean=false`). Options: `render`, `keep_links`, `structured_data`, `country`, `max_chars`/`offset` windowing, per-call `freshness_seconds` caching. | proxy/browser only |
| `search_web` | Find URLs for a query: ranked organic results with title, url and snippet. Options: `count`, `country`, `engine`. | no LLM |
| `discover_urls` | List the URLs a site publishes in robots.txt and XML sitemaps — a reviewable inventory for `scrape_pages`/`parse_pages`, with `pattern`/`prefix` filters. Not a crawler. | no LLM |
| `parse_marketplace` | Product page (`target="product"`) or listing (`target="search_results"`) → structured JSON. Pass `schema` for your own shape, `include_offers` for Amazon Buy-Box data, `include_meta` for cost/provenance metadata. | LLM only when the deterministic tiers miss |
| `extract` | Any URL or raw text + your JSON Schema → extracted JSON. `instructions` steers the extraction. | always one LLM call (or cache) |
| `get_account` | Tenant identity, configured capabilities, session spend counters. | no |

### Batch jobs

| Tool | Description |
|---|---|
| `scrape_pages` / `parse_pages` | The tools above over many URLs; return a `job_id` immediately (or wait up to `wait_seconds`). |
| `get_job` | Poll status and collect per-item results. |
| `cancel_job` | Stop a running job (stops the spending). |

### Browser automation (23 tools)

One live browser session per account, driven step by step:

| Category | Tools |
|---|---|
| Navigation | `browser_navigate`, `browser_go_back`, `browser_go_forward`, `browser_reload`, `browser_scroll` |
| Interaction | `browser_click`, `browser_type`, `browser_fill`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_press_key` |
| Content | `browser_get_text`, `browser_get_html`, `browser_console_messages`, `browser_evaluate` |
| Snapshot | `browser_snapshot`, `browser_snapshot_items` (accessibility tree with element `ref`s — take a snapshot first, then interact by `ref`) |
| Capture | `browser_screenshot`, `browser_save_as_pdf` |
| Sessions | `browser_save_session`, `browser_load_session`, `browser_list_sessions` (persist and restore login states) |

### CAPTCHA

| Tool | Description | Costs money? |
|---|---|---|
| `list_captcha_types` | The catalogue of solvable types with their required parameters — call it before `solve_captcha` instead of guessing. | no |
| `solve_captcha` | Solve a CAPTCHA of any supported kind; returns the token/answer, a `captcha_id`, and the cost. | **yes — one solve per call** |
| `captcha_report` | Report a solution good/bad (bad reports refund). | no |
| `captcha_balance` | Current balance in USD. | no |

### Local

| Tool | Description |
|---|---|
| `session_stats` | Tool usage during this session (calls per tool, rate-limit window). Handled locally, free. |

---

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_TOKEN` | **yes** | — | Your 2Captcha API key, or the bearer token your server operator issued |
| `GROUPS` | no | `parsing,batch,captcha` | Comma-separated tool groups (see above); `all` disables filtering |
| `TOOLS` | no | — | Comma-separated individual tool names to enable |
| `MCP_URL` | no | `https://mcp.2captcha.com/mcp` | The remote MCP endpoint — set it for a self-hosted server |
| `POLLING_TIMEOUT` | no | `600` | Per-tool-call timeout in seconds (renders, batch jobs and CAPTCHA solves can take minutes) |
| `RATE_LIMIT` | no | — | Client-side call limiter, e.g. `100/1h` or `50/30m` |

---

## How it works

This package is a thin stdio bridge to the remote service: tool schemas are fetched live from the server at startup and on every `tools/list`, so the package never drifts from the deployed tool surface, and new server-side tools appear automatically under `GROUPS=all`. Calls are forwarded verbatim — including `structuredContent`, images (screenshots), and tool errors — with automatic reconnection if the connection drops mid-session.

Costs are metered server-side against your token: scraping spends proxy/browser resources, `solve_captcha` spends one solve per call, and the LLM extraction in `parse_marketplace`/`extract` bills your own LLM key when you have one vaulted (BYOK), the server default otherwise. Pass `include_meta: true` to the parsing tools to see exactly what a call spent.

---

## Troubleshooting

### "Cannot run without the API_TOKEN env"

Set `API_TOKEN` in the `env` block of your client config to your 2Captcha API key ([account settings](https://2captcha.com/setting)).

### "Authentication to … failed"

The server rejected the token. Check for whitespace, and confirm which credential your deployment accepts (2Captcha API key vs. an operator-issued token).

### "spawn npx ENOENT"

Your MCP client can't find Node. Install [Node.js ≥ 18](https://nodejs.org) and make sure `npx` is on the PATH the client uses (on macOS GUI apps, use an absolute path to `npx`).

### Timeouts on hard sites

Pages that force the full ladder (managed browser + CAPTCHA solve) can take minutes. Raise `POLLING_TIMEOUT` (seconds), and prefer `scrape_pages`/`parse_pages` for many URLs so the waiting happens server-side.

### A tool I expect is missing

The default exposes `parsing,batch,captcha`. Set `GROUPS=all` (or add `browser`). If it is still missing, the server itself has that tool set disabled.

---

## License

MIT — © 2Captcha. See [LICENSE](./LICENSE).
