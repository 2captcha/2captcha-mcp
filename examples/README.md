# Examples

Five things this server does that a general-purpose fetcher does not. Each script runs against the
live service and prints what the call cost, so nothing here implies a price it did not pay.

```bash
export API_TOKEN=your-2captcha-api-key      # https://2captcha.com/setting
node examples/01_marketplace_rows_for_nothing.mjs
```

Node 18+. No dependencies beyond the `@modelcontextprotocol/sdk` this package already installs, so
`npm install` in the repo root is all the setup there is. `MCP_URL` defaults to
`https://mcp.2captcha.com/mcp`; set it if you run your own server.

The [free monthly allowance](../README.md#free-tier-whats-included) covers all five several times
over — four of them cost nothing at all.

| | Example | What it shows |
|---|---|---|
| 01 | [Marketplace rows for nothing](01_marketplace_rows_for_nothing.mjs) | A site's own hidden endpoint, mapped to a fixed schema — no browser, no model. **100 priced rows, $0.000000, `llm_calls 0`** |
| 02 | [A JavaScript-only page](02_javascript_only_page.mjs) | Events read from the page's own client-side state, which the visible HTML does not contain. **ISO dates + venues, `renders 0`** |
| 03 | [Sitemap to dataset](03_sitemap_to_dataset.mjs) | Know what a site publishes *before* spending on pages, then batch a slice. **19,393 URLs seen, $0.000000** |
| 04 | [The same product in two countries](04_same_product_two_countries.mjs) | Cross-market pricing matched on **article number**, not on product name. **One call per market, $0.000000** |
| 05 | [What it cost, and whether to trust it](05_what_it_cost_and_whether_to_trust_it.mjs) | Per-call spend, the tier-ladder trace, per-field provenance, and a typed failure. **`tier=api`, 421 ms, $0.000000** |

## Why these five

**A price you can act on, at a price you can predict.** Example 01 returns 100 rows with the
pre-discount price on each, so "is this a real discount?" is arithmetic rather than a judgement —
one row came back at 64,395 RUB against an original of 139,990. It costs nothing because it asks the
endpoint the site's own front end asks. `api_tier_only: true` makes that a guarantee rather than a
hope: the deterministic endpoint answers, or the call returns nothing. It never quietly falls back
to a browser and a model, which is the difference between a predictable bill and a surprise one.

**Content that is not in the HTML.** Example 02 is the case that defeats naive scraping: hashed
class names that rotate weekly, no semantic markup, and a cleaned page that yields "your browser is
not supported". The data is in the document, in the app's own state — so it comes back with no
browser and no model at all.

**Discovery before spending.** Example 03 reads robots.txt and the XML sitemaps and stops. No crawl,
no proxy, no browser, no page fetch. It also refuses to overstate itself: that run returned
`reason=partial` with `sitemap_scan_truncated`, because a document budget stopped the scan. A number
you can trust beats a bigger one you cannot. Then one `scrape_pages` call turns a slice into a job
you can poll and cancel, where each item reports *why* it is empty if it is.

**Comparisons that are actually comparable.** Example 04 matches on the retailer's own article
number. Search by name in two countries and you get two different variants, then report the
difference as a price gap — which is how a 40 cm white shelf ends up priced against an 80 cm
black-oak one. Where a site gates by IP rather than by URL path, `country: 'de'` pins the residential
exit *and* the managed browser's geo for that one call.

**Every answer says where it came from.** Example 05 is the one to read if you are putting this in a
pipeline. Each field carries its extractor — a mapped hidden API, the page's own JSON-LD, a DOM
parse, or a model — and a confidence. Each call carries its cost, its proxy bytes, its browser
launches, and the full ladder trace with a per-rung outcome. And a URL with no product returns `{}`,
no keys at all, rather than a schema-shaped object of nulls, because "the page had no price" and
"there is no page" are different answers and only one belongs in a dataset.

## The tier ladder, and one honest caveat

Every fetch takes the cheapest rung that works and escalates only on failure:

```
hidden API  →  plain HTTP  →  TLS-impersonated client  →  in-country exit  →  managed browser + CAPTCHA
```

`usage.attempts` prints the whole climb, so you can see which rung actually paid off and what the
ones before it cost.

The caveat, stated here rather than discovered later: **the hardest anti-bot targets are a per-site,
per-day question, not a guarantee.** While preparing these examples, one commercial-anti-bot search
page was extracted cleanly — 30 priced listings with street addresses in 54 seconds — and then,
minutes later, refused the same request for 394 seconds across three browser engines. There is no
example of that here, because an example that fails half the time is worse than none.

What the second run *did* return is the point: `blocked: true`, `warnings: ["blocked_upstream=403",
"extraction_skipped_blocked"]`, and no model was paid to read the challenge page. Knowing you were
refused is the difference between a gap in your dataset and a wrong number in it — and it is why
example 05 is in this list at all.

## Notes

- Cost figures are estimates for attribution, not billing. `get_account` shows your allowance and
  spend.
- Live sites move. Row counts, prices and totals will differ from the numbers above; the *shape* of
  each answer is what these examples demonstrate.
- Examples 01, 03, 04 and 05 are free to run. 02 costs a fraction of a cent in proxy traffic.
- `_client.mjs` is the shared 60-line client. Its `call_settled` helper follows the slow-page
  handoff: a tool that outlives the synchronous deadline returns a job id instead of the data, and
  re-issuing the call is handed the *same* job rather than starting a second paid fetch.
- Tool reference and every parameter: the [main README](../README.md).
