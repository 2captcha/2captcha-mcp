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
    BROWSER: {
        id: 'browser',
        name: 'Browser automation',
        description: 'Drive a real managed browser step by step: navigate, '
            +'click, type, snapshot, screenshot, saved sessions.',
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
        description: 'Solve any CAPTCHA type 2Captcha supports, report bad '
            +'solutions, check the balance.',
        tools: [
            'list_captcha_types',
            'solve_captcha',
            'captcha_report',
            'captcha_balance',
        ],
    },
};

// What a bare `npx @2captcha/mcp` exposes. Browser tools are opt-in
// (GROUPS=browser or GROUPS=all) — 23 extra tools is a lot of client context.
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
