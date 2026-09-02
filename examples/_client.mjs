// Minimal MCP client shared by the examples. Uses only the SDK this package already depends on.
//
//   export API_TOKEN=your-2captcha-api-key
//   node examples/01_marketplace_rows_for_nothing.mjs
//
// MCP_URL defaults to the hosted endpoint; set it if you run your own server.
// The `/mcp` suffix matters: `/mcp/` 307-redirects and some HTTP clients drop the
// Authorization header across the hop.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}
    from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEFAULT_URL = 'https://mcp.2captcha.com/mcp';

export function endpoint(){
    const url = process.env.MCP_URL || DEFAULT_URL;
    const token = (process.env.API_TOKEN || '').trim();
    if (!token){
        console.error('set API_TOKEN to your 2Captcha API key '
            +'(https://2captcha.com/setting)');
        process.exit(1);
    }
    return {url, token};
}

// One tool call, returning the structured payload.
export async function call(tool, args = {}){
    const {url, token} = endpoint();
    const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: {headers: {Authorization: `Bearer ${token}`}},
    });
    const client = new Client({name: '2captcha-examples', version: '1.0.0'});
    await client.connect(transport);
    try {
        const res = await client.callTool({name: tool, arguments: args});
        if (res.structuredContent){
            // Tools returning a model put its fields at the top level; the dict-returning
            // tools nest under "result". Unwrap so an example can just read the data.
            const sc = res.structuredContent;
            return sc.result !== undefined ? sc.result : sc;
        }
        const text = (res.content || []).map(c=>c.text || '').join('');
        try { return JSON.parse(text); } catch { return text; }
    } finally {
        await client.close();
    }
}

// Like call(), but follows the slow-page handoff to its answer.
//
// A tool that outlives the synchronous deadline returns a live JobStatus instead of the
// data: the work continues server-side and `next_call` names the follow-up. This is not an
// error and must not be retried — re-issuing the same call is handed the SAME job rather
// than starting a second paid fetch. Hard pages routinely land here.
export async function call_settled(tool, args = {}, {poll_every = 5000,
    timeout = 300000} = {}){
    const out = await call(tool, args);
    if (!(out && out.job_id && out.data === undefined))
        return out;

    const job_id = out.job_id;
    console.log(`   (slow page: handed off to job ${job_id.slice(0, 8)}`
        +' — polling, not re-asking)');
    for (let waited = 0; waited < timeout; waited += poll_every){
        await new Promise(r=>setTimeout(r, poll_every));
        const job = await call('get_job', {job_id});
        if (job.state !== 'running')
            return (job.items || [{}])[0].result || {};
        if (job.progress)
            console.log(`   .. ${job.progress}`);
    }
    throw new Error(`job ${job_id} still running after ${timeout / 1000}s`);
}

export function show(label, value, limit = 200){
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    console.log(`${label.padEnd(22)} ${String(rendered).slice(0, limit)}`);
}

// The one-line cost summary every example prints, so the price is never implicit.
export function usage_line(meta){
    const u = (meta || {}).usage || {};
    return `tier=${meta.tier || meta.source} `
        +`${u.duration_ms ?? '?'}ms  `
        +`$${(u.cost_usd ?? 0).toFixed(6)}  `
        +`llm_calls=${u.llm_calls ?? '?'}  `
        +`renders=${u.renders ?? '?'}  `
        +`proxy_bytes=${u.proxy_bytes ?? '?'}`;
}
