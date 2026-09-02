// The same product in two markets, matched by article number rather than by name.
//
// Cross-country pricing is where a naive comparison quietly goes wrong: search for a product in
// two countries and you get two DIFFERENT variants, then report the difference as a price gap.
// The fix is to match on the identifier the retailer itself uses.
//
// This retailer keys its market off the URL path, so no particular exit country is needed here.
// Measured against the live service, one call per market, $0.000000 each:
//
//     article       GB       DE
//     s69398837     £150     €149.99
//     s99395936     £110     €124.97
//     s49280042     £75      €69.99
//
// A per-article comparison — the opposite shape of answer from "country X is cheaper", which is
// what comparing a 40 cm white shelf against an 80 cm black-oak one produces.
//
// Where a site gates by IP rather than by URL path, `country: 'de'` pins the residential exit AND
// the managed browser's geo for that one call, overriding the ccTLD default.
//
//     node examples/04_same_product_two_countries.mjs
import {call, usage_line} from './_client.mjs';

const QUERY = 'billy bookcase';
const MARKETS = [['gb', 'en'], ['de', 'de']];
const ARTICLE_RE = /-(s?\d{8})\/?$/;   // the retailer's article number, from the product URL

async function rows(cc, lang){
    const out = await call('parse_marketplace', {
        url: `https://www.ikea.com/${cc}/${lang}/search/?q=${encodeURIComponent(QUERY)}`,
        target: 'search_results',
        api_tier_only: true,
        include_meta: true,
        // For an IP-gated site this is the knob that matters — it pins the exit and browser geo:
        // country: cc,
    });
    console.log(`   ${cc.toUpperCase()}: ${out.data.total_results} hits ·`,
        usage_line(out.meta));
    const by_article = {};
    for (const row of out.data.results || []){
        const m = ARTICLE_RE.exec(row.url || '');
        if (m)
            by_article[m[1]] = row;
    }
    return by_article;
}

const [gb, de] = await Promise.all(MARKETS.map(m=>rows(...m)));
const shared = Object.keys(gb).filter(a=>de[a]).sort();
console.log();

if (!shared.length){
    console.log('   no article appeared in both markets this run — assortment differs by country');
    process.exit(0);
}

console.log(`   ${shared.length} article(s) present in BOTH markets:\n`);
console.log(`     ${'article'.padEnd(12)} ${'GB'.padStart(10)}  ${'DE'.padStart(10)}   product`);
for (const article of shared){
    const a = gb[article], b = de[article];
    console.log(`     ${article.padEnd(12)} `
        +`${a.price.toFixed(2).padStart(9)} ${(a.currency || '').padEnd(3)} `
        +`${b.price.toFixed(2).padStart(9)} ${(b.currency || '').padEnd(3)}  `
        +`${a.title.slice(0, 38)}`);
}

console.log('\n   Matched on the article number. Comparing by NAME is how a 40 cm white unit ends'
    +'\n   up priced against an 80 cm black-oak one and the gap gets reported as a currency story.');
