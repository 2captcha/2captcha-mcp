// Nineteen thousand URLs from a site's own sitemap, then a batch job over a slice of them.
//
// The two-step every scraping project actually starts with: find out what the site publishes,
// review it, THEN spend money on pages. `discover_urls` reads robots.txt and the XML sitemaps
// and stops — no crawl, no proxy, no browser, no page fetch.
//
// Measured against the live service:
//
//     19,393 URLs seen · 2,089 matched the glob · 32 sitemap documents · $0.000000
//
// It also refuses to imply completeness it does not have: that run came back `reason=partial`
// with `sitemap_scan_truncated`, because a document budget stopped the scan. A number you can
// trust is worth more than a bigger one you cannot.
//
// Then `scrape_pages` turns a slice into one background job: a job id immediately, progress you
// can poll, `cancel_job` to stop while keeping what finished, and a per-item `reason` when an
// item comes back empty — so a blocked page and a genuinely empty one are different facts.
//
//     node examples/03_sitemap_to_dataset.mjs
import {call, show, usage_line} from './_client.mjs';

const SITE = 'https://www.newegg.com';
const GLOB = '*/p/N82E*';   // the product-page prefix. A loose '*/p/*' also matches this site's
                            // keyword-LISTING routes (/p/pl?d=...), which carry no product.
const SLICE = 3;            // keep the demo cheap; raise it when you mean it

const found = await call('discover_urls', {site: SITE, pattern: GLOB, limit: 200});

show('total_seen', found.total_seen);
show('total_matched', found.total_matched);
show('sitemaps_checked', found.sitemaps_checked);
show('reason', found.reason);        // 'partial' is a fact, not an error
show('warnings', found.warnings);
console.log('  ', usage_line({usage: found.usage, tier: 'fast'}));
console.log();

const urls = (found.urls || []).map(u=>u.url).slice(0, SLICE);
if (!urls.length){
    console.log('   no URLs matched — try a different pattern');
    process.exit(0);
}

console.log(`   fetching ${urls.length} of them as one job`);
const job = await call('scrape_pages', {urls, clean: true, max_chars: 2000, wait_seconds: 60});
show('job_id', job.job_id);
show('state', `${job.state}  settled=${job.settled}/${job.total}`);
console.log();

for (const item of job.items || []){
    const chars = ((item.result || {}).markdown || '').length;
    console.log(`     ${String(item.state).padEnd(9)} `
        +`${String(item.duration_ms || 0).padStart(6)} ms `
        +`${String(chars).padStart(6)} chars  ${item.reason || ''}  `
        +`${(item.url || '').slice(0, 56)}`);
}

// Still running? The job id is the whole point — nothing is lost by walking away.
if (job.state === 'running')
    console.log(`\n   still working: get_job(job_id='${job.job_id}')`);
