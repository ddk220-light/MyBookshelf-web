/* Research-only public FDA/EPA search UI runner. Invoke under the registry flock
 * after policy preflight. Requires an installed Playwright WebKit browser.
 * No hidden API, login, order, PDF, media, or full-content download is used.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {webkit} = require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE || '@playwright/test');
const source = process.argv[2];
const endpoints = {
  'fda-guidance': 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
  'epa-nepis': 'https://nepis.epa.gov/Exe/ZyNET.EXE?ZyActionL=Register&User=anonymous&Password=anonymous&Client=EPA&Init=1',
};
if (!endpoints[source]) throw Error('Unreviewed source');
const queries = process.argv.length > 3 ? process.argv.slice(3) : source === 'fda-guidance'
  ? ['manufacturing','biosimilar','gene therapy','medical gases','allergens','seafood','tobacco','cybersecurity','sterility','antibiotics','zzznobook481276']
  : ['wastewater','asbestos','radon','drinking water','air pollution','pesticides','recycling','climate','flood','wetlands','zzznobook481276'];
const registry = path.resolve(__dirname, '../../docs/research/free-content/registry');
const output = path.join(registry, 'examples', source + '.browser.jsonl');
const save = x => fs.appendFileSync(output, JSON.stringify(x) + '\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  const p = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  const proxy = p ? {server:p.origin, ...(p.username ? {username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)} : {})} : undefined;
  const browser = await webkit.launch({headless:true, proxy});
  const context = await browser.newContext({viewport:{width:1280,height:900}, userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
  const page = await context.newPage();
  await page.route('**/*', route => route.request().resourceType() === 'media' || /\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(route.request().url()) ? route.abort() : route.continue());
  let initial;
  let failureCount = 0;
  try {
    for (const query of queries) {
      const row = {source_id:source, observed_at:new Date().toISOString(), query, endpoint:endpoints[source], execution_mode:'published-anonymous-browser-search', query_verified:false, browser:'WebKit', paid_services_used:false, full_content_downloaded:false};
      try {
        if (!initial || source === 'epa-nepis') {
          await pause(source === 'fda-guidance' ? 30000 : 3000);
          const response = await page.goto(endpoints[source], {waitUntil:'domcontentloaded',timeout:40000});
          initial = {status:response.status(),url:page.url(),body_sha256:digest(await response.body())};
          row.initial_http = initial;
          if (response.status() !== 200) throw Error('Initial page HTTP ' + response.status());
        }
        row.initial_http = initial;
        if (source === 'fda-guidance') {
          await page.locator('table tbody tr td a').first().waitFor({state:'attached',timeout:40000});
          await page.locator('#search-filter').fill(query);
          await page.locator('#search-filter').press('Enter');
          await pause(3000);
          row.records = await page.locator('table tbody tr').evaluateAll(trs => trs.slice(0,15).map(tr => ({cells:[...tr.querySelectorAll('td')].map(td => td.innerText.trim()),links:[...tr.querySelectorAll('a')].map(a => ({title:a.textContent.trim(),url:a.href}))})));
          row.result_summary = await page.locator('.dataTables_info').allTextContents();
          row.visible_query = await page.locator('#search-filter').inputValue();
        } else {
          await page.locator('input[name="Query"]').fill(query);
          await pause(3000);
          const [response] = await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:40000}),page.locator('input[name="ZyActionS"]').click()]);
          row.search_http = {status:response.status(),url:page.url(),body_sha256:digest(await response.body())};
          if (response.status() !== 200) throw Error('Search HTTP ' + response.status());
          await page.locator('#results').waitFor({state:'attached',timeout:10000});
          row.records = await page.locator('#results tr').evaluateAll(trs => trs.slice(0,15).map(tr => ({text:tr.textContent.trim(),links:[...tr.querySelectorAll('a')].map(a=>({title:a.textContent.trim(),url:a.getAttribute('href'),onclick:a.getAttribute('onclick')})),inputs:[...tr.querySelectorAll('input')].map(i=>({name:i.name,value:i.value}))})));
          row.result_summary = await page.locator('h1,h2,h3').allTextContents();
          row.visible_query = new URL(page.url()).searchParams.get('Query');
        }
        row.final_url = page.url();
        row.observed_output_sha256 = digest(JSON.stringify(row.records));
        row.outcome = 'observed';
        if (query === queries[0]) {
          await page.locator(source === 'fda-guidance' ? '#search-filter' : '#results').scrollIntoViewIfNeeded();
          const file = path.resolve(registry,'../evidence/2026-11-05-industry-search',source+'-results.png');
          await page.screenshot({path:file});
          row.screenshot='evidence/2026-11-05-industry-search/'+source+'-results.png';
        }
      } catch (e) {
        row.outcome='failed'; row.error=e.message; failureCount++;
      }
      save(row); console.log(source, query, row.outcome, row.records?.length || 0);
      if ([401,403,429,503].includes(row.search_http?.status) || [401,403,429,503].includes(row.initial_http?.status) || failureCount >= 2) break;
      await pause(3000);
    }
  } finally { await context.close(); await browser.close(); }
})().catch(e=>{save({source_id:source, observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;});
