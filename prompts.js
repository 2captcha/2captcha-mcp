'use strict'; /*jslint node:true es9:true*/

// Prompts: the recipes from examples/, in the form a client can offer from a
// menu. A tool list tells an agent what it CAN do; these tell it what is worth
// doing and in what order, which is the part a first-time user does not know.
//
// They are local, not proxied. The remote service exposes tools; the knowledge
// of which ladder rung to ask for, and that `include_meta` is how you find out
// what a call cost, lives in this package alongside the examples it came from.
// Remote prompts, if the service ever advertises any, are merged in by
// server.js on top of these.

const CHEAP_FIRST = 'Prefer the cheapest rung that can answer: a hidden JSON '
    +'API beats rendering a page, and rendering beats paying a model to read '
    +'it. Pass `include_meta: true` so every answer carries what it cost.';

const SLOW_HANDOFF = 'If a call returns `job_id` with `state: "running"` it '
    +'has been handed off, not failed — poll the `get_job` named in '
    +'`next_call`. Never re-issue the original call: it is handed the SAME '
    +'job, so retrying buys nothing and reads as a second attempt.';

const BLOCKED = 'If a result carries `blocked: true`, the payload is the '
    +'challenge page rather than the data — say so instead of reporting what '
    +'it says.';

export const PROMPTS = [
    {
        name: 'marketplace_to_table',
        title: 'Marketplace listing → table',
        description: 'Turn a marketplace search or product URL into priced '
            +'rows, taking the site\'s own endpoint before anything that '
            +'costs money.',
        arguments: [
            {name: 'url', description: 'Marketplace search or product URL',
                required: true},
            {name: 'free_only', required: false,
                description: 'If "true", pass api_tier_only so the call '
                    +'returns nothing rather than silently falling back to a '
                    +'browser and a model'},
        ],
        build: a=>`Parse ${a.url} into a table of rows.\n\n`
            +`Use \`parse_marketplace\` with \`include_meta: true\`${
                a.free_only==='true'
                    ? ' and `api_tier_only: true`, so the deterministic '
                        +'endpoint answers or the call returns nothing — no '
                        +'silent paid fallback' : ''}.\n\n`
            +'Set `target` to `search_results` for a listing page and '
            +'`product` for a single item. Report one row per product with '
            +'price, currency, title and seller, and where the row carries '
            +'`original_price`, show the discount as arithmetic rather than '
            +`as a claim.\n\n${SLOW_HANDOFF}\n\n${BLOCKED}\n\n`
            +'Finish with the one-line cost from `meta.usage`: tier, '
            +'duration, `cost_usd`, `llm_calls`, `renders`.',
    },
    {
        name: 'sitemap_to_dataset',
        title: 'Sitemap → dataset',
        description: 'See what a site publishes before spending anything on '
            +'it, then batch a reviewed slice of those URLs.',
        arguments: [
            {name: 'site', description: 'Site root, e.g. https://example.com',
                required: true},
            {name: 'limit', description: 'How many URLs to actually fetch '
                +'(default 20)', required: false},
        ],
        build: a=>`Build a dataset from ${a.site}, cheapest step first.\n\n`
            +'1. `discover_urls` on the site root. This reads robots.txt and '
            +'the XML sitemaps and crawls nothing, so it is the one step that '
            +'tells you the size of the job before you have paid for any of '
            +'it. Report how many URLs exist and how they are grouped.\n'
            +`2. Choose at most ${a.limit || '20'} URLs that match what was `
            +'asked for, and show me that list before fetching it.\n'
            +'3. `scrape_pages` over the approved slice, then `get_job` until '
            +'it settles.\n\n'
            +`${SLOW_HANDOFF}\n\n`
            +'Report the total `cost_usd` across the job, not per page.',
    },
    {
        name: 'captcha_in_my_browser',
        title: 'Solve a CAPTCHA in my own browser',
        description: 'Name the wall on a page you already have open, and get '
            +'back the JavaScript or cookie to apply in your own session — '
            +'the session never moves to us.',
        arguments: [
            {name: 'page_url', description: 'URL of the page showing the '
                +'CAPTCHA', required: true},
        ],
        build: a=>'I have a page open in my own browser (Playwright MCP, '
            +'browser-use, Chrome DevTools — whichever you are driving) and '
            +`it is showing a CAPTCHA at ${a.page_url}.\n\n`
            +'1. Read the page HTML from the browser you are already '
            +'driving.\n'
            +'2. Call `detect_captcha` with that HTML. This is free — it '
            +'names the wall and its sitekey without solving anything, so do '
            +'it before deciding whether solving is worth it.\n'
            +'3. If it is worth solving, call `solve_captcha_on_page` with '
            +'the same HTML and the page URL. It returns an `apply` block: '
            +'either `apply.javascript` to evaluate in the page, or a cookie '
            +'to set.\n'
            +'4. Apply it in MY browser and continue the original task there. '
            +'Do not navigate the managed browser — the point of these two '
            +'tools is that my session stays mine.\n\n'
            +'Tell me which CAPTCHA type it was and what the solve cost.',
    },
    {
        name: 'login_and_save_session',
        title: 'Sign in past a CAPTCHA, keep the session',
        description: 'Use the managed browser to get through a sign-in wall '
            +'once, then save the cookies so later runs skip the wall.',
        arguments: [
            {name: 'login_url', description: 'URL of the sign-in page',
                required: true},
            {name: 'session_name', description: 'Name to save the session '
                +'under', required: true},
        ],
        build: a=>`Sign in at ${a.login_url} and save the session as `
            +`"${a.session_name}".\n\n`
            +'This needs the browser login tools, so it requires '
            +'`GROUPS=browser` (11 tools) or `GROUPS=browser_full`. If they '
            +'are not in your tool list, say so and stop rather than '
            +'improvising with the parsing tools.\n\n'
            +'1. `browser_load_session` first — if a saved session is still '
            +'valid there is nothing to do, and a needless login risks a '
            +'lockout.\n'
            +'2. Otherwise `browser_navigate`, then `browser_snapshot` to see '
            +'the form, then `browser_fill` the fields. Ask me for '
            +'credentials; never guess them.\n'
            +'3. The managed browser solves a CAPTCHA in the form itself, so '
            +'submit and read the result rather than solving separately.\n'
            +'4. `browser_save_session` under the given name once you can see '
            +'a signed-in page, and tell me how you verified that.\n\n'
            +'Note there is ONE live page per account, so do not assume '
            +'parallel tabs.',
    },
    {
        name: 'compare_across_markets',
        title: 'Same product, two markets',
        description: 'Price one product in two countries, matched on article '
            +'number rather than on product name.',
        arguments: [
            {name: 'url_a', description: 'Product URL in the first market',
                required: true},
            {name: 'url_b', description: 'Product URL in the second market',
                required: true},
        ],
        build: a=>`Compare ${a.url_a} against ${a.url_b}.\n\n`
            +'Call `parse_marketplace` once per URL with `target: "product"` '
            +'and `include_meta: true`. Use `country` to pin the proxy exit '
            +'to each market, since a ccTLD alone does not guarantee which '
            +'storefront answers.\n\n'
            +'Match the two on ARTICLE NUMBER or SKU, not on title — '
            +'localised names diverge and matching on them silently compares '
            +'different products. If the article numbers do not match, say '
            +'that the comparison is unsound rather than reporting a '
            +'difference.\n\n'
            +'Report both prices in their own currencies, and the total cost '
            +'of the two calls.',
    },
    {
        name: 'what_did_it_cost',
        title: 'Audit what a call cost',
        description: 'Run one call with full metadata and explain the tier '
            +'ladder, the spend and how much of the answer is trustworthy.',
        arguments: [
            {name: 'url', description: 'URL to fetch', required: true},
        ],
        build: a=>`Fetch ${a.url} with \`include_meta: true\` and then `
            +'account for it.\n\n'
            +`${CHEAP_FIRST}\n\n`
            +'Report, from `meta`:\n'
            +'- which tier actually answered, and which rungs were tried '
            +'first\n'
            +'- `usage.cost_usd`, `usage.duration_ms`, `usage.llm_calls`, '
            +'`usage.renders`, `usage.proxy_bytes`\n'
            +'- per-field provenance where the response carries it, so I can '
            +'see which values were read off the page and which a model '
            +'inferred\n'
            +'- any `warnings`, verbatim\n\n'
            +`${BLOCKED}\n\n`
            +'Then call `get_account` and tell me what is left of the '
            +'allowance.',
    },
];

// A prompt's arguments arrive as strings or not at all; required ones are
// enforced here rather than in each builder.
export function render_prompt(name, args = {}){
    const prompt = PROMPTS.find(p=>p.name===name);
    if (!prompt)
        return null;
    const missing = (prompt.arguments || [])
        .filter(arg=>arg.required && !args[arg.name]).map(arg=>arg.name);
    if (missing.length)
        throw new Error(`missing required argument(s): ${missing.join(', ')}`);
    return {
        description: prompt.description,
        messages: [{role: 'user',
            content: {type: 'text', text: prompt.build(args)}}],
    };
}

// What the client sees in its menu — `build` is ours, not part of the spec.
export function prompt_descriptors(){
    return PROMPTS.map(({name, title, description, arguments: args})=>({
        name, title, description, arguments: args || []}));
}
