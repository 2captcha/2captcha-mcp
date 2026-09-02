// 100 priced marketplace rows for $0.00, from the site's own hidden endpoint.
//
// Wildberries renders its catalogue client-side, so the visible page is a shell. Rather than
// render it and pay a model to read the text, the ladder's first rung calls the endpoint the
// site's own front end calls and maps the payload into a fixed schema.
//
// Measured against the live service:
//
//     100 rows · total_results 15,567 · 1 HTTP request
//     $0.000000 · llm_calls 0 · renders 0 · proxy_bytes 0
//
// Every row carries the pre-discount price too, so "is this a real discount?" is arithmetic
// rather than a judgement: one row came back at 64,395 RUB against an original of 139,990.
//
// `api_tier_only: true` is what makes this a guarantee rather than a hope — the deterministic
// endpoint answers, or the call returns nothing. It never quietly falls back to a browser and a
// model, which is the difference between a predictable bill and a surprise one.
//
//     node examples/01_marketplace_rows_for_nothing.mjs
import {call, show, usage_line} from './_client.mjs';

const URL_ = 'https://www.wildberries.ru/catalog/0/search.aspx?search=iphone%2015';

const out = await call('parse_marketplace', {
    url: URL_,
    target: 'search_results',
    api_tier_only: true,   // deterministic endpoint or nothing — never a silent paid fallback
    include_meta: true,
});
const {data, meta} = out;
const rows = data.results || [];

show('query', data.query);
show('total_results', data.total_results);
show('rows returned', rows.length);
console.log();

for (const row of rows.slice(0, 5)){
    const was = row.original_price;
    const cut = was && row.price
        ? `  (was ${was.toLocaleString('en-US')}, -${Math.round(100 - row.price / was * 100)}%)`
        : '';
    console.log(`  ${String(Math.round(row.price)).padStart(10)} `
        +`${(row.currency || '').padEnd(4)} ${row.title.slice(0, 44).padEnd(44)} `
        +`${(row.seller || '-').padEnd(18)}${cut}`);
}

console.log();
console.log('  ', usage_line(meta));
console.log('   endpoint:', meta.endpoint_host, '· confidence:', meta.confidence_tier);

// Both facts a share-of-shelf question needs are already here: no second pass per product.
const brands = new Set(rows.map(r=>r.brand).filter(Boolean));
const sellers = new Set(rows.map(r=>r.seller).filter(Boolean));
console.log(`   ${brands.size} distinct brands, ${sellers.size} distinct sellers `
    +`across ${rows.length} rows`);
