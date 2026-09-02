// Every call reports what it spent, which rung answered, and how each field got there.
//
// The failure this exists to prevent: an extractor handed a challenge page returns a well-formed
// EMPTY object, and "the site blocked us" becomes indistinguishable from "the site has no such
// product". Downstream, that is a null in a price feed.
//
// So three things ride along with every answer:
//
//   usage        cost, tokens, proxy exit bytes, browser launches, CAPTCHA solves, and the full
//                ladder trace with a per-rung outcome and reason. Estimates for attribution.
//   provenance   per FIELD: which mechanism produced it (a mapped hidden API, the page's own
//                JSON-LD, a DOM parse, or a model) and whether it was present at all.
//   warnings     a vocabulary, not prose: blocked_upstream=403, page_not_found=404,
//                large_output, output_truncated, input_truncated, partial_block.
//
// Measured against the live service, a deterministic hit on a public endpoint:
//
//     tier=api · 421 ms · $0.000000 · llm_calls 0 · 1 HTTP request
//
// This example also asks for a URL that does not exist, because how a fetcher FAILS is the part
// you otherwise find out about in production. A dead URL comes back in well under a second with
// a typed reason, no model call and no browser — not as a plausible-looking empty product.
//
//     node examples/05_what_it_cost_and_whether_to_trust_it.mjs
import {call, show, usage_line} from './_client.mjs';

const ALIVE = 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/';
const DEAD = 'https://store.steampowered.com/app/999999999/Nonexistent_Game/';

console.log('== a page that exists ==');
const out = await call('parse_marketplace',
    {url: ALIVE, target: 'product', api_tier_only: true, include_meta: true});
const {data, meta} = out;
show('title', data.title);
show('price', `${data.price} ${data.currency || ''}`);
show('availability', data.availability);
console.log('  ', usage_line(meta));
console.log();

console.log('   how each field got here:');
const prov = meta.field_provenance || {};
const conf = meta.field_confidence || {};
for (const field of ['title', 'price', 'availability', 'brand', 'rating']){
    const p = prov[field] || {};
    console.log(`     ${field.padEnd(14)} extractor=${String(p.extractor).padEnd(9)}`
        +` present=${String(p.present).padEnd(6)} confidence=${conf[field] ?? 0}`);
}
console.log();
console.log('   `rating` is null on purpose here: this endpoint publishes a 0-100 critic score,');
console.log('   and putting it in a 0-5 field would read as off-the-scale to anything comparing');
console.log('   one host against another.');
console.log();

console.log('== the same shape of URL, but dead ==');
const dead = await call('parse_marketplace',
    {url: DEAD, target: 'product', api_tier_only: true, include_meta: true});
show('data', dead.data);                 // {} — no keys at all, not nulls
show('blocked', dead.meta.blocked);
show('warnings', dead.meta.warnings);
console.log('  ', usage_line(dead.meta));
console.log();
console.log('   {} rather than a schema-shaped object of nulls: an empty product and a URL that');
console.log('   has no product are different answers, and only one of them belongs in a dataset.');
