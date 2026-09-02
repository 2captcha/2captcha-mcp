<div align="center">

<h1>2Captcha MCP:      tools for AI agents, web scraping and browser automation</h1>

<p><strong>Web scraping with anti-bot bypass, marketplace parsing to structured JSON, and CAPTCHA solving for AI agents over the Model Context Protocol.</strong></p>
<p>Works with Claude, Cursor, coding agents, and any MCP-compatible client.</p>

<p>
  <strong>Free monthly allowance on every account</strong> — sign up, add your API key, and the
  first 200 calls a month are on us. <a href="#free-tier-whats-included">What's included</a>
</p>

<p>
  <a href="#free-tier-whats-included">Free Tier</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#tool-selection-groups">Tool Groups</a> •
  <a href="#tools-reference-40-tools">Tools</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

</div>

> [!IMPORTANT]
> The official 2Captcha MCP package is **`@2captcha/mcp`** (published under the [@2captcha](https://www.npmjs.com/org/2captcha) npm organization). The unscoped `2captcha-mcp` package on npm is **not affiliated with 2Captcha** — don't put your API key into it.

---

## Overview

The 2Captcha MCP server gives AI agents real-time access to web data that blocks ordinary HTTP clients. It exposes **40 tools** covering:

- **Web search** — ranked organic results (title, URL, snippet) for a query
- **Page scraping** — any URL as clean Markdown or raw HTML. Every request runs through a tiered anti-bot ladder: hidden JSON APIs, a TLS-impersonating HTTP client, rotating residential proxies, and a managed browser with CAPTCHA solving — escalating only as far as the page requires, so easy pages stay fast and cheap.
- **Marketplace parsing** — product pages and search listings as structured JSON (title, price, rating, seller, stock, offers). Deterministic tiers first (hidden marketplace APIs, JSON-LD, learned selectors); an LLM extraction pass only when they miss.
- **Structured extraction** — any URL or raw text plus your own JSON Schema in, matching JSON out.
- **Batch jobs** — run the scraping/parsing tools over many URLs as a background job: submit, poll, cancel.
- **CAPTCHA solving, including in *your* browser** — solve any type 2Captcha supports (reCAPTCHA, Turnstile, hCaptcha, DataDome, images, …). `detect_captcha` names the wall on a page you are already driving in Playwright MCP, browser-use or an extension — free, from HTML you paste in — and `solve_captcha_on_page` solves it and hands back the exact JavaScript or cookie to apply in **your own session**. Nothing has to move to our browser.
- **Browser logins** — opt-in. Sign in to a site whose login form is behind a CAPTCHA, in a managed browser, and save the session for later.

Two deployment options: the **hosted remote server** (one URL, no installation) or a **local instance** via `npx @2captcha/mcp`.

---

## Free tier: what's included

Signing up for 2Captcha is free, and an account comes with a monthly allowance on this server:
**200 calls or $0.50 of measured spend per 30 days**, whichever comes first, across the **whole**
tool surface — scraping, marketplace parsing, structured extraction, batch jobs, the browser tools
and CAPTCHA solving. No card, no separate plan, no feature gating.

The window is rolling rather than calendar-monthly, so capacity returns continuously instead of
everyone's quota resetting on the 1st.

The allowance is metered **per account**, which is why a credential is required: the identity is
what it is counted against. There is no anonymous mode — an IP address is not an identity, and a
free tier keyed to one is a free tier keyed to a proxy pool.

`get_account` reports what is left, so an agent can plan around the limit instead of discovering it
as a failure halfway through a task:

```json
{"tenant": "2captcha:8f14e45fceea167a",
 "free_tier": {"allowance": {"max_calls": 200, "calls": 12, "remaining_calls": 188,
                             "max_spend_usd": 0.5, "remaining_spend_usd": 0.4871,
                             "window_hours": 720}}}
```

Nothing else on this server bills per call: CAPTCHA solves are charged to your 2Captcha balance as
they always were, and `include_meta: true` reports what any call actually cost. So when the
allowance runs out, calls are refused until the window refills — the message says so, and says the
operator can raise it. Need more than the allowance? Talk to the operator; on the hosted service
that is [2Captcha support](https://2captcha.com/support).

---

## Quick Start

### Hosted server — no installation

Add the URL to your MCP client with an `Authorization` header:

```
URL:    https://mcp.2captcha.com/mcp
Header: Authorization: Bearer YOUR_API_TOKEN
```

Your token is your **2Captcha API key** ([account settings](https://2captcha.com/setting)) or the bearer token your server operator issued. Signing up is free and brings the [monthly allowance](#free-tier-whats-included) with it.

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

By default the server exposes the **parsing, batch, and captcha** groups (17 tools). The browser groups are opt-in: they are the one part of the surface that costs a client real context every turn, and most tasks never touch it.

Measured cost of each group, as the tool definitions a client puts on every request (name +
description + JSON Schema, tiktoken `o200k_base` — regenerate with the service repo's
`benchmarks/scripts/tool_surface_tokens.py`):

| Group | Tools | Tokens |
|---|---:|---:|
| `parsing` | 7 | 3,936 |
| `batch` | 4 | 1,759 |
| `captcha` | 6 | 2,180 |
| **default (the three above)** | **17** | **7,875** |
| `browser` | 11 | +2,842 |
| `browser_full` | 23 | +5,201 |
| `all` | 40 | 13,076 |

| Group | Tools | What it's for |
|---|---|---|
| `parsing` | `scrape_page`, `search_web`, `discover_urls`, `discover_search_params`, `parse_marketplace`, `extract`, `get_account` | Search the web, scrape pages, discover a site's URLs and its search parameters, parse marketplaces, extract structured JSON |
| `batch` | `scrape_pages`, `parse_pages`, `get_job`, `cancel_job` | The parsing tools over many URLs as background jobs |
| `captcha` | `list_captcha_types`, `solve_captcha`, `detect_captcha`, `solve_captcha_on_page`, `captcha_report`, `captcha_balance` | Solve any CAPTCHA type 2Captcha supports — including one on a page in **your own** browser |
| `browser` | 11 `browser_*` tools | Sign in behind a CAPTCHA in a managed browser and save the session |
| `browser_full` | all 23 `browser_*` tools | The complete Playwright-style surface, when you actually want it here |
| `all` | everything the server advertises | No filtering — includes tools added server-side in the future |

**Why `captcha` is a default and `browser` is not.** `detect_captcha` and `solve_captcha_on_page`
work on HTML from whatever browser you are *already* driving, so they are useful to a client that
never opens ours — which is the common case. See [Driving your own
browser](#driving-your-own-browser-recommended).

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

## Tools Reference (40 Tools)

### Which tool to use

- **Looking for pages to scrape?** → `search_web` (query → ranked URLs)
- **Just need the page content?** → `scrape_page` (no LLM, cheapest)
- **Need a URL inventory before batching?** → `discover_urls` (robots.txt + sitemaps, no crawling)
- **Building a search URL for a site?** → `discover_search_params` (its real parameter names, not a guess)
- **Product or search page → JSON?** → `parse_marketplace` (deterministic tiers first, LLM fallback)
- **Your own schema from any page/text?** → `extract` (always one LLM call, or cache)
- **Many URLs?** → `scrape_pages` / `parse_pages` + `get_job`
- **Hit a CAPTCHA in your own browser?** → `detect_captcha` (free) then `solve_captcha_on_page`
- **A CAPTCHA token for your own automation?** → `list_captcha_types` then `solve_captcha`
- **Log in past a CAPTCHA and keep the session?** → `GROUPS=browser`, then `browser_navigate` → `browser_fill` → `browser_click` → `browser_save_session`

### Parsing

| Tool | Description | Costs money? |
|---|---|---|
| `scrape_page` | Fetch a page and return its readable content as markdown (or raw HTML with `clean=false`). Options: `render`, `keep_links`, `structured_data`, `country`, `max_chars`/`offset` windowing, per-call `freshness_seconds` caching. | proxy/browser only |
| `search_web` | Find URLs for a query: ranked organic results with title, url and snippet. Options: `count`, `country`, `engine`. | no LLM |
| `discover_urls` | List the URLs a site publishes in robots.txt and XML sitemaps — a reviewable inventory for `scrape_pages`/`parse_pages`, with `pattern`/`prefix` filters. Not a crawler. | no LLM |
| `discover_search_params` | A site's real URL search parameters, read off one page: the query parameters its own links use (with values known to work) plus any `<form>` controls. Use it instead of guessing a search URL. | no LLM |
| `parse_marketplace` | Product page (`target="product"`) or listing (`target="search_results"`) → structured JSON. Pass `schema` for your own shape, `include_offers` for Amazon Buy-Box data, `include_meta` for cost/provenance metadata. | LLM only when the deterministic tiers miss |
| `extract` | Any URL or raw text + your JSON Schema → extracted JSON. `instructions` steers the extraction. | always one LLM call (or cache) |
| `get_account` | Tenant identity, configured capabilities, session spend counters. | no |

### Batch jobs

| Tool | Description |
|---|---|
| `scrape_pages` / `parse_pages` | The tools above over many URLs; return a `job_id` immediately (or wait up to `wait_seconds`). |
| `get_job` | Poll status and collect per-item results. |
| `cancel_job` | Stop a running job (stops the spending). |

### Driving your own browser (recommended)

If you already have a browser — Playwright MCP, browser-use, a Chrome extension, your own
Playwright script — **keep it**, and use these two tools for the part that needs a solver account:

```
your browser hits a wall
  -> browser_get_html / page.content()      your session, your IP
  -> detect_captcha(url, html=...)          free: "recaptcha, sitekey 6Lc..., solvable"
  -> solve_captcha_on_page(url, html=...)   one solve
  -> run apply.javascript in your page      returns 'callback' / 'submit' / 'set'
```

`apply.javascript` is a complete expression with the token already inlined — it is the same
injector this service's own render tier uses — so it drops straight into `page.evaluate`, a
devtools console, or any run-JS tool. When the answer is a cookie instead (DataDome, AWS WAF) you
get the parsed cookie and the instruction to re-request rather than reload.

Two things worth knowing. Pass `html` from **your** browser, because anti-bot walls are raised per
client and our address sees a different page than yours. And for DataDome or CaptchaFox pass your
own `proxy` and `user_agent`: those answers are minted for the identity that solved them, so one
solved as us is refused in your session even though it is technically correct.

### Browser logins (`GROUPS=browser`, 11 tools)

The managed browser is not trying to out-Playwright Playwright. That surface is free and you
probably already have it, and this one holds **one live page per account**, so it is the wrong tool
for anything parallel. What it has that a plain browser does not is that it solves the CAPTCHA in
the login form, and it can keep the cookies afterwards — so the group is scoped to exactly that,
at **2,842 tokens instead of 5,201**:

| Category | Tools |
|---|---|
| Navigate & interact | `browser_navigate`, `browser_click`, `browser_fill`, `browser_type`, `browser_press_key` |
| Read | `browser_snapshot` (accessibility tree with element `ref`s), `browser_get_text`, `browser_get_html` |
| Sessions | `browser_save_session`, `browser_load_session`, `browser_list_sessions` |

Set `GROUPS=browser_full` for the complete 23-tool surface — adding history (`browser_go_back`,
`browser_go_forward`, `browser_reload`), `browser_scroll`, `browser_select_option`,
`browser_hover`, `browser_drag`, `browser_console_messages`, `browser_evaluate`,
`browser_snapshot_items`, `browser_screenshot` and `browser_save_as_pdf`.

### CAPTCHA

| Tool | Description | Costs money? |
|---|---|---|
| `list_captcha_types` | The catalogue of solvable types with their required parameters — call it before `solve_captcha` instead of guessing. | no |
| `solve_captcha` | Solve a CAPTCHA of any supported kind; returns the token/answer, a `captcha_id`, and the cost. | **yes — one solve per call** |
| `detect_captcha` | Identify the wall on a page — widget type, sitekey, whether a solvable task can be built from it, and the exact `solve_captcha` call to issue. Pass `html` from your own browser. Never solves. | no (free with `html`) |
| `solve_captcha_on_page` | Detect + solve in one step, and return an `apply` block: a self-contained JS expression to `evaluate`, or a cookie to add and a URL to re-request. | **yes — one solve per call** |
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
| `API_TOKEN` | **yes** | — | Your 2Captcha API key, or the bearer token your server operator issued. Signing up is free and includes the [monthly allowance](#free-tier-whats-included) |
| `GROUPS` | no | `parsing,batch,captcha` | Comma-separated tool groups (see above): `browser` adds the 11 login tools, `browser_full` all 23, `all` disables filtering |
| `TOOLS` | no | — | Comma-separated individual tool names to enable |
| `MCP_URL` | no | `https://mcp.2captcha.com/mcp` | The remote MCP endpoint — set it for a self-hosted server |
| `POLLING_TIMEOUT` | no | `600` | Per-tool-call timeout in seconds (renders, batch jobs and CAPTCHA solves can take minutes) |
| `RATE_LIMIT` | no | — | Client-side call limiter, e.g. `100/1h` or `50/30m` |

---

## How it works

This package is a thin stdio bridge to the remote service: tool schemas are fetched live from the server at startup and on every `tools/list`, so the package never drifts from the deployed tool surface, and new server-side tools appear automatically under `GROUPS=all`. Calls are forwarded verbatim — including `structuredContent`, images (screenshots), and tool errors — with automatic reconnection if the connection drops mid-session.

Costs are metered server-side against your token: scraping spends proxy/browser resources, `solve_captcha` spends one solve per call, and the LLM extraction in `parse_marketplace`/`extract` bills your own LLM key when you have one vaulted (BYOK), the server default otherwise. Pass `include_meta: true` to the parsing tools to see exactly what a call spent — this service is the only one that reports the price of a call to the agent making it, rather than only in a dashboard afterwards.

The [free-tier allowance](#free-tier-whats-included) runs on that same meter, keyed to your account over its own 30-day window — which is why `get_account` can tell you exactly how many calls and how much spend you have left.

---

## Troubleshooting

### "Cannot run without the API_TOKEN env"

Set `API_TOKEN` in the `env` block of your client config to your 2Captcha API key ([account
settings](https://2captcha.com/setting)). The free allowance is metered per account, so it needs
the credential — signing up is free.

### "Authentication to … failed"

The server rejected the token. Check for whitespace, and confirm which credential your deployment accepts (2Captcha API key vs. an operator-issued token).

### "has used N of N calls allowed per 720h"

Your account's [monthly allowance](#free-tier-whats-included) is spent. The window is rolling, so
capacity returns as older calls age out; `get_account` shows how much is left and when. On a
self-hosted server the operator raises `WEBPARSE_FREE_TIER_MAX_CALLS` /
`WEBPARSE_FREE_TIER_MAX_SPEND_USD`, or exempts the account entirely.

### "is outside this server's allowance, which covers: …"

The operator narrowed the allowance to a subset of tools (`WEBPARSE_FREE_TIER_TOOLS`). That is a
server-wide restriction, not something a different credential lifts — ask them to widen it.
`get_account` lists the tools your account can reach.

### "spawn npx ENOENT"

Your MCP client can't find Node. Install [Node.js ≥ 18](https://nodejs.org) and make sure `npx` is on the PATH the client uses (on macOS GUI apps, use an absolute path to `npx`).

### Timeouts on hard sites

Pages that force the full ladder (managed browser + CAPTCHA solve) can take minutes. Raise `POLLING_TIMEOUT` (seconds), and prefer `scrape_pages`/`parse_pages` for many URLs so the waiting happens server-side.

### A tool I expect is missing

The default exposes `parsing,batch,captcha`. For a browser tool, set `GROUPS=browser` (the 11
login tools) or `GROUPS=browser_full` (all 23); `GROUPS=all` disables filtering entirely. If it is
still missing, the server itself has that tool set disabled — or the operator narrowed the
allowance to a subset of tools (`get_account` will say).

---

## License

MIT — © 2Captcha. See [LICENSE](./LICENSE).
