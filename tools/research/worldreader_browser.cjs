// Bounded anonymous BookSmart search through the operator's visible UI.
// No accounts, book files, tracking payloads, headers or startup tokens are saved.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { webkit } = require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE || '@playwright/test');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = body => crypto.createHash('sha256').update(body).digest('hex');
const APP = 'https://booksmart.worldreader.org';
const BOOKS = 'https://books-api.worldreader.org';
const USER = 'https://user-api.worldreader.org';

(async () => {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  const browser = await webkit.launch({ headless: true, proxy: proxy ? {
    server: proxy.origin,
    ...(proxy.username ? { username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : {}),
  } : undefined });
  const captures = [], blocked = new Set();
  let queue = Promise.resolve();
  const append = row => fs.appendFileSync(input.output, JSON.stringify(row) + '\n');
  try {
    const page = await browser.newPage({ userAgent: input.user_agent, viewport: { width: 1280, height: 900 } });
    await page.route('**/*', async route => {
      const req = route.request(), u = new URL(req.url()), type = req.resourceType();
      const startup = req.method() === 'GET' && u.origin === USER && u.pathname === '/v1/auth/startup';
      const metadata = req.method() === 'GET' && u.origin === BOOKS && ['/v1/books', '/v1/categories/root'].includes(u.pathname);
      const app = u.origin === APP && req.method() === 'GET' && !['image', 'font', 'media', 'xhr', 'fetch'].includes(type)
        && !/\.(pdf|epub|mp3|mp4|zip)$/i.test(u.pathname);
      if (!(startup || metadata || app) || blocked.has(u.origin)) return route.abort();
      if (app) return route.continue();
      queue = queue.then(async () => {
        if (blocked.has(u.origin)) return route.abort();
        await pause(Math.max(3000, input.pace_ms || 3000));
        try {
          const response = await route.fetch({ timeout: 20000, maxRedirects: 0 });
          const status = response.status();
          if (status !== 200) {
            blocked.add(u.origin);
            if (u.searchParams.has('search')) captures.push({ api_url: req.url(), http: { status, truncated: false }, error: 'Provider access/service failure; stop and wait' });
            return route.fulfill({ response });
          }
          if (metadata && u.pathname === '/v1/books' && u.searchParams.has('search')) {
            const body = await response.body();
            if (body.length > 256 * 1024) throw Error('Metadata response exceeds bound');
            const parsed = JSON.parse(body);
            if (!Array.isArray(parsed.books) || parsed.books.length > 20) throw Error('Unexpected metadata page shape');
            const data = { totalCount: parsed.totalCount, count: parsed.count, offset: parsed.offset, limit: parsed.limit,
              books: parsed.books.map(b => ({ uuid: b.uuid, version: b.version, title: b.title })) };
            captures.push({ observed_at: new Date().toISOString(), api_url: req.url(),
              http: { status, truncated: false }, response_sha256: hash(body), bytes: body.length,
              metadata: data, metadata_sha256: hash(JSON.stringify(data)), error: null });
          }
          // Forward the response to the normal UI; startup response is never persisted.
          await route.fulfill({ response });
        } catch (error) {
          blocked.add(u.origin);
          if (u.searchParams.has('search')) captures.push({ api_url: req.url(), http: { status: null, truncated: false }, error: String(error).slice(0,250) });
          await route.abort();
        }
      });
      await queue;
    });
    let setupError;
    try {
      const response = await page.goto(APP + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (response.status() !== 200) throw Error('App HTTP ' + response.status());
      const own = page.getByText('Explore on our own', { exact: true });
      await own.waitFor({ state: 'visible', timeout: 30000 });
      await own.click();
      // The tour appears asynchronously after navigation. Both actions are visible UI controls.
      const skip = page.getByText('Skip', { exact: true });
      await skip.waitFor({ state: 'visible', timeout: 45000 });
      await skip.click();
      await page.getByRole('button', { name: /^Explore$/i }).click();
      await page.waitForURL(APP + '/explore', { timeout: 20000 });
      await pause(3000); // Ionic transition retains the old visible input briefly.
      await page.locator('input[placeholder="Find a book"]:visible').waitFor({ timeout: 20000 });
    } catch (error) { setupError = String(error).slice(0,500); }
    for (const c of input.cases) {
      const start = captures.length;
      let error = setupError, cap;
      try {
        if (error) throw Error(error);
        if (blocked.size) throw Error('Earlier provider failure; do not retry in this batch');
        const box = page.locator('input[placeholder="Find a book"]:visible');
        await box.fill(c.query_text);
        await box.press('Enter');
        // Current UI requires Enter. It may issue duplicate requests; only this
        // case's matching response is assessed, never counted as extra examples.
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline) {
          cap = captures.slice(start).find(x => new URL(x.api_url).searchParams.get('search') === c.query_text);
          if (cap) break;
          await pause(250);
        }
        if (!cap) throw Error('Visible form did not produce the expected search response');
        if (cap.error) throw Error(cap.error);
        await pause(500);
      } catch (failure) { error = String(failure).slice(0,500); }
      const row = { ...(cap || {}), case_id: c.id, query: c.query_text, request: c.request,
        observed_at: cap?.observed_at || new Date().toISOString(), error: error || null,
        http: cap?.http || { status: null, truncated: false },
        response_sha256: cap?.response_sha256 || hash(''), full_content_downloaded: false,
        execution: 'Anonymous visible BookSmart search; no account or direct standalone API client',
        ui_url: page.url(),
        visible_result_text: (await page.locator('body').innerText()).slice(0,4500),
        observed_search_requests: captures.slice(start).map(x => ({ api_url: x.api_url, http: x.http, error: x.error })) };
      append(row);
      console.log(c.id, row.metadata?.count, row.error || 'captured');
      if (error) break;
      await pause(Math.max(3000, input.pace_ms || 3000));
    }
    await queue;
  } finally { await browser.close(); }
})().catch(error => { console.error(String(error)); process.exitCode = 1; });
