// Dev utility (not shipped to npm): spawn server.js against a real endpoint,
// list tools, and make a couple of cheap calls to verify connectivity.
// Usage:
//   node connect-check.mjs <mcp-url> [api-token]
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const [, , mcp_url, token] = process.argv;
const env = {...process.env, MCP_URL: mcp_url, GROUPS: 'all'};
delete env.API_TOKEN;
if (token)
    env.API_TOKEN = token;

const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['server.js'],
    env,
});
const client = new Client({name: 'connect-check', version: '0.0.0'});
await client.connect(transport);

const {tools} = await client.listTools();
console.log(`\n== tools advertised: ${tools.length}`);
console.log(tools.map(t=>t.name).join(', '));

const account = await client.callTool({name: 'get_account'});
console.log('\n== get_account →');
console.log(JSON.stringify(account.structuredContent
    ?? account.content, null, 2).slice(0, 1200));

const scrape = await client.callTool({name: 'scrape_page',
    arguments: {url: 'https://example.com', max_chars: 200}});
const s = scrape.structuredContent ?? {};
console.log('\n== scrape_page(https://example.com) →');
console.log(JSON.stringify({tier: s.tier, status_code: s.status_code,
    blocked: s.blocked, markdown: s.markdown?.slice(0, 120)}, null, 2));

const stats = await client.callTool({name: 'session_stats'});
console.log('\n== session_stats →');
console.log(stats.content[0].text);

await client.close();
console.log('\nCONNECT CHECK PASSED');
