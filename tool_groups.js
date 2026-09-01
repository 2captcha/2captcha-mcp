'use strict'; /*jslint node:true es9:true*/

// Tool groups over the remote 2Captcha Web MCP surface. Group membership is a
// client-side view only — the server decides what actually exists (its own
// WEBPARSE_BROWSER_TOOLS_ENABLED / WEBPARSE_CAPTCHA_TOOLS_ENABLED switches),
// so a name listed here that the server does not advertise is simply absent.

export const GROUPS = {
    PARSING: {
        id: 'parsing',
        name: 'Parsing',
        description: 'Scrape pages and extract structured JSON through the '
            +'anti-bot tier ladder.',
        tools: [
            'scrape_page',
            'search_web',
            'discover_urls',
            // A site's real URL search parameters, read off one page. It belongs with search_web:
            // that finds WHICH url, this reads the grammar for building one. It had been missing
            // from every group since the server added it, so the default client filtered out a
            // tool the server was advertising — see the "advertised … but not enabled" note
            // server.js now prints, which is there to stop that happening again.
            'discover_search_params',
            'parse_marketplace',
            'extract',
            'get_account',
        ],
    },
    BATCH: {
        id: 'batch',
        name: 'Batch jobs',
        description: 'Run the parsing tools over many URLs as a background '
            +'job: submit, poll, cancel.',
        tools: [
            'scrape_pages',
            'parse_pages',
            'get_job',
            'cancel_job',
        ],
    },
    // The login group: get past a sign-in wall once, keep the session, come back
    // to it later.
    //
    // Eleven tools, not the twenty-three the server has. The full set is a
    // Playwright-MCP-shaped surface, and Playwright MCP is free and usually
    // already installed alongside us. Measured (tiktoken o200k_base, over the
    // name + description + input_schema block a client actually sends): all 23
    // cost 5,201 tokens, these 11 cost 2,842, so opting in gets 45% of the
    // browser surface for the tools a login flow uses. Their SCHEMAS are the
    // bigger half (2,642 vs 1,931 of prose), which is why the count — not the
    // wording — was the thing to cut. The managed browser also holds
    // ONE live page per account, so it cannot win on the parallelism the
    // browser-only vendors sell. What it has that none of them do is a browser
    // that solves the CAPTCHA in the login form, and somewhere to keep the
    // cookies afterwards. That is what this group is, and nothing more.
    //
    // For everything else the better pairing is Playwright MCP or browser-use
    // for the driving, plus detect_captcha / solve_captcha_on_page (CAPTCHA
    // group, on by default) for the wall: those read HTML from YOUR browser and
    // hand back the injection recipe, so the session never has to move here.
    // GROUPS=browser_full still exposes all 23 for anyone who wants them.
    BROWSER: {
        id: 'browser',
        name: 'Browser logins',
        description: 'Sign in to a site behind a CAPTCHA in a managed browser '
            +'and save the session for later: navigate, fill, click, read, '
            +'save/load. One live page per account.',
        tools: [
            'browser_navigate',
            'browser_click',
            'browser_fill',
            'browser_type',
            'browser_press_key',
            'browser_snapshot',
            'browser_get_text',
            'browser_get_html',
            'browser_save_session',
            'browser_load_session',
            'browser_list_sessions',
        ],
    },
    BROWSER_FULL: {
        id: 'browser_full',
        name: 'Browser automation (full)',
        description: 'Every browser tool the server has, adding history, '
            +'scrolling, hover/drag, select, console, evaluate, screenshot and '
            +'PDF. 23 tools, ~5.2k tokens of client context.',
        tools: [
            'browser_navigate',
            'browser_go_back',
            'browser_go_forward',
            'browser_reload',
            'browser_scroll',
            'browser_click',
            'browser_type',
            'browser_fill',
            'browser_select_option',
            'browser_hover',
            'browser_drag',
            'browser_press_key',
            'browser_get_text',
            'browser_get_html',
            'browser_console_messages',
            'browser_evaluate',
            'browser_snapshot',
            'browser_snapshot_items',
            'browser_screenshot',
            'browser_save_as_pdf',
            'browser_save_session',
            'browser_load_session',
            'browser_list_sessions',
        ],
    },
    CAPTCHA: {
        id: 'captcha',
        name: 'CAPTCHA solving',
        description: 'Solve any CAPTCHA type 2Captcha supports — including one '
            +'on a page in your OWN browser — report bad solutions, check the '
            +'balance.',
        tools: [
            'list_captcha_types',
            'solve_captcha',
            // Work on HTML you supply from whatever browser you already drive:
            // name the wall for free, or solve it and get back the JS or cookie
            // to apply in your own session. This is what makes 2Captcha
            // additive to Playwright MCP and browser-use instead of a
            // competitor to them, so it ships in the DEFAULT groups.
            'detect_captcha',
            'solve_captcha_on_page',
            'captcha_report',
            'captcha_balance',
        ],
    },
};

// What a bare `npx @2captcha/mcp` exposes. The browser groups are opt-in
// (GROUPS=browser for the 11 login tools, browser_full for all 23, or all):
// the default 17 tools cost ~7.9k tokens of client context, +2.8k for the login
// set or +5.2k for the full one, and most tasks never touch either. Note that
// `captcha` is a DEFAULT: detect_captcha and
// solve_captcha_on_page work on a page in the caller's own browser, so they are
// useful to a client that never opens ours.
export const DEFAULT_GROUPS = ['parsing', 'batch', 'captcha'];

// Resolve GROUPS/TOOLS env values into an allowlist.
// Returns {allowed: Set<string>|null, unknown_groups: string[]} —
// allowed === null means "no filtering, expose everything the server has".
export function build_allowed_tools(group_ids = [], custom_tools = []){
    if (group_ids.includes('all'))
        return {allowed: null, unknown_groups: []};
    const ids = group_ids.length || custom_tools.length
        ? group_ids : DEFAULT_GROUPS;
    const allowed = new Set(), unknown_groups = [];
    for (const id of ids)
    {
        const group = Object.values(GROUPS).find(g=>g.id===id);
        if (!group)
        {
            unknown_groups.push(id);
            continue;
        }
        for (const tool of group.tools)
            allowed.add(tool);
    }
    for (const tool of custom_tools)
        allowed.add(tool);
    return {allowed, unknown_groups};
}
