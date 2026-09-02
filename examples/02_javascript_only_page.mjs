// Every event on a page whose content does not exist in its HTML.
//
// Ticketmaster is a Next.js app. Its event grid has no `href="/event/…"`, no `<time datetime>`
// and no `itemprop`, and its class names are hashed and rotate on every deploy — so a DOM
// scrape breaks weekly, and cleaning the 555 KB page yields navigation plus a "your browser is
// not supported" notice. The events never reach the text.
//
// They are, however, in the document: the page ships the response of its own search call inside
// its client-side state. The adapter reads that.
//
// Measured against the live service — 30 events one day, 20 the next, because the count is
// whatever is on sale:
//
//     ISO start times · "venue, city, ST" · per-event URL · llm_calls 0 · renders 0 · ~$0.0005
//
// No browser and no model, on a page that looks like it needs both. The cost is not zero because
// the page itself is still fetched through a proxy — it is the render and the model this avoids,
// and those are the expensive parts. Rows even name the host actually selling each ticket,
// because partner inventory is listed alongside their own.
//
// Worth knowing what this is NOT: the search payload carries no price. `price` comes back null
// and stays null rather than being guessed at from elsewhere on the page.
//
//     node examples/02_javascript_only_page.mjs
import {call, show, usage_line} from './_client.mjs';

const URL_ = 'https://www.ticketmaster.com/search?q=Radiohead';

const out = await call('parse_marketplace', {
    url: URL_,
    target: 'search_results',
    api_tier_only: true,
    include_meta: true,
});
const {data, meta} = out;
const rows = data.results || [];

show('query', data.query);
show('events', rows.length);
console.log();

for (const row of rows.slice(0, 6)){
    const when = (row.date || '').slice(0, 16).replace('T', ' ');
    console.log(`  ${when.padEnd(17)} ${row.title.slice(0, 38).padEnd(38)} `
        +`${(row.venue || '').slice(0, 34)}`);
}

console.log();
const hosts = {};
for (const r of rows)
    if (r.seller)
        hosts[r.seller] = (hosts[r.seller] || 0) + 1;
console.log('   selling host per event (partner inventory sits alongside their own):');
for (const [host, n] of Object.entries(hosts).sort((a, b)=>b[1] - a[1]))
    console.log(`     ${String(n).padStart(3)}  ${host}`);

console.log();
console.log('  ', usage_line(meta));
console.log('   endpoint:', meta.endpoint_host, '· source:', meta.source);
const dated = rows.filter(r=>r.date).length;
const venued = rows.filter(r=>r.venue).length;
const priced = rows.filter(r=>r.price !== null && r.price !== undefined).length;
console.log(`   ${dated}/${rows.length} have an ISO date · ${venued}/${rows.length} a venue`
    +` · ${priced}/${rows.length} a price (the payload carries none — null, not guessed)`);
