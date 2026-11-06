/* Public subject->Math navigation; capture title links only, never book bodies. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { webkit } = require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE || '@playwright/test');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  const browser = await webkit.launch({ headless: true, proxy: proxy ? {
    server: proxy.origin,
    ...(proxy.username ? { username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : {})
  } : undefined });
  const context = await browser.newContext({ userAgent: 'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)' });
  const page = await context.newPage();
  const observation = { source_id: 'openstax', observed_at: new Date().toISOString(), full_content_downloaded: false, query_verified: false };
  await page.route('**/*', route => ['media', 'image'].includes(route.request().resourceType()) || /\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(route.request().url()) ? route.abort() : route.continue());
  try {
    const response = await page.goto('https://openstax.org/subjects', { waitUntil: 'domcontentloaded', timeout: 40000 });
    observation.http_status = response.status();
    if (response.status() !== 200) throw Error('Initial HTTP ' + response.status());
    const link = page.getByRole('link', { name: 'View all Math books', exact: true });
    await link.waitFor({ timeout: 30000 });
    const reject = page.getByRole('button', { name: 'Reject All', exact: true });
    if (await reject.count()) await reject.click();
    if (new URL(await link.getAttribute('href'), page.url()).href !== 'https://openstax.org/subjects/math') throw Error('Published catalog route changed');
    await pause(3000);
    await link.click();
    await page.waitForURL('https://openstax.org/subjects/math', { timeout: 30000 });
    await page.locator('a[href="/details/books/algebra-and-trigonometry-2e"]').first().waitFor({ timeout: 30000 });
    await pause(1500);
    observation.catalog_url = page.url();
    observation.catalog_navigation = 'Published subject link; client-side navigation, no separate document HTTP assertion';
    observation.links = await page.locator('a').evaluateAll(anchors => anchors.filter(a => a.textContent.trim() && /\/details\/books\/|\/books\//.test(a.href)).map(a => ({ title: a.textContent.trim(), url: a.href })));
    observation.observed_output_sha256 = crypto.createHash('sha256').update(JSON.stringify(observation.links)).digest('hex');
    observation.outcome = 'observed';
  } catch (error) {
    observation.outcome = 'failed';
    observation.error = error.message;
    try { observation.failure_text = (await page.locator('body').innerText()).slice(0, 3000); } catch {}
  } finally {
    fs.writeFileSync(process.argv[2], JSON.stringify(observation, null, 2));
    console.log(observation.outcome, observation.links?.length || 0, observation.error || '');
    await browser.close();
  }
})();
