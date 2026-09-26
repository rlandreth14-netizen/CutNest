// Real screenshots of the app for the website. Run: node tools/screenshots.js
// Drives the actual app (Pro, licence check faked) on sample jobs and writes
// WebP images to img/. Re-run whenever the app's look changes, so the site
// never shows a screen the app no longer has.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'img');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();

  // PNG buffer -> WebP file, encoded by the browser itself (no image library).
  const conv = await (await browser.newContext()).newPage();
  async function save(name, png, quality) {
    const b64 = await conv.evaluate(async ({ src, q }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', q).split(',')[1];
    }, { src: 'data:image/png;base64,' + png.toString('base64'), q: quality || 0.86 });
    fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(b64, 'base64'));
    console.log('  img/' + name + '.webp', Math.round(Buffer.from(b64, 'base64').length / 1024) + 'KB');
  }

  async function appPage(viewport, scale) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale || 1, serviceWorkers: 'block' });
    // Licence check answered locally (as in tests/ui.test.js); everything else off-site blocked.
    await ctx.route('https://api.lemonsqueezy.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ valid: true, activated: true, instance: { id: 'i1' }, license_key: { status: 'active' }, meta: { store_id: 394602 } }) }));
    await ctx.route(u => !u.href.startsWith(base) && u.hostname !== 'api.lemonsqueezy.com', r => r.abort());
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('shot-init')) return;
      sessionStorage.setItem('shot-init', '1');
      localStorage.setItem('cn-cookie', 'declined');
      localStorage.setItem('cutnest-settings-v1', JSON.stringify({ kerf: 4, kerfTouched: true, companyName: 'Harper Fabrications Ltd',
        quote: { business: { address: 'Unit 7, Forge Road\nNewcastle NE6 2XX', phone: '0191 496 0000', email: 'sales@harperfab.co.uk', web: '', taxNo: 'GB123456789' } } }));
      localStorage.setItem('cutnest-licence-v1', JSON.stringify({ key: 'ABCD1234-EF56-7890-ABCD-1234567890AB', verified: true, lastCheck: new Date().toISOString() }));
    });
    const page = await ctx.newPage();
    await page.goto(base + '/app.html');
    await page.addStyleTag({ content: '.app-hdr{position:static!important}' });   // no sticky header over the shots
    await page.waitForFunction(() => isPro && library.length > 20);
    return page;
  }
  async function calc(page, mats, ref, qty) {
    await page.evaluate(({ job, ref, qty }) => {
      job.forEach(function (m, i) { m.id = 'mat-' + (i + 1); });
      mats = job;                                         // the app's own `let mats`
      document.getElementById('job-ref').value = ref; document.getElementById('job-qty').value = String(qty || 1);
      renderAll();
    }, { job: mats, ref, qty });
    await page.click('#calc-btn');
    await page.waitForFunction(() => !_calcBusy && document.getElementById('output').style.display === 'block', null, { timeout: 60000 });
    await page.waitForTimeout(700);                     // results fade in
  }
  const doc = async function (page, html, viewport, name, clip) {
    const p2 = await page.context().newPage();
    await p2.setViewportSize(viewport);
    await p2.setContent(html);
    await save(name, await p2.screenshot(clip ? { clip } : { fullPage: false }));
    await p2.close();
  };

  console.log('Screenshots');
  // 1. Sheet results: a kitchen carcass job in MDF.
  let page = await appPage({ width: 1180, height: 1500 });
  await calc(page, [{ selectedMatId: 601, pieces: [
    { label: 'Side', w: 720, h: 560, qty: 6 }, { label: 'Base', w: 564, h: 560, qty: 3 },
    { label: 'Shelf', w: 564, h: 520, qty: 3 }, { label: 'Rail', w: 564, h: 100, qty: 6 }, { label: 'Door', w: 715, h: 497, qty: 6 }] }], 'KIT-114');
  await page.evaluate(() => document.getElementById('output').scrollIntoView());
  // Cards, totals and the first sheet: the part of the results people look at.
  const box = await page.evaluate(() => {
    const a = document.querySelector('#output .results-shell').getBoundingClientRect();
    const b = document.querySelector('#mat-visuals .sheet-vis').getBoundingClientRect();
    return { x: a.left + scrollX, y: a.top + scrollY, width: a.width, height: b.bottom - a.top + 8 };
  });
  await save('app-results', await page.screenshot({ clip: box, fullPage: true }));
  await save('app-sheet', await (await page.$('#mat-visuals .sheet-vis')).screenshot());
  await doc(page, await page.evaluate(() => buildCutSheetsHtml()), { width: 1120, height: 800 }, 'app-cutsheet', { x: 0, y: 0, width: 1120, height: 682 });

  // 2. Bars: a frame in box section, with an end trim.
  await page.evaluate(() => { const e = library.find(l => l.id == 801); e.trim = 10; });
  await calc(page, [{ selectedMatId: 801, pieces: [{ label: 'Top rail', w: 2400, h: '', qty: 4 }, { label: 'Leg', w: 900, h: '', qty: 8 }, { label: 'Brace', w: 650, h: '', qty: 6 }] }], 'FRM-022');
  await save('app-bars', await (await page.$('#mat-visuals .detail-section')).screenshot());

  // 3. Quote: sheet and bar together, with a delivery line.
  await calc(page, [
    { selectedMatId: 102, pieces: [{ label: 'Cover', w: 600, h: 400, qty: 4 }, { label: 'Bracket', w: 300, h: 200, qty: 10 }, { label: 'Base plate', w: 450, h: 450, qty: 3 }] },
    { selectedMatId: 801, pieces: [{ label: 'Leg', w: 900, h: '', qty: 8 }, { label: 'Rail', w: 2400, h: '', qty: 4 }] }], 'JOB-051');
  await page.click('.res-acts >> text=Quote');
  await page.fill('#q-customer', 'Tyne Joinery Ltd');
  await page.fill('#q-contact', 'Quayside Works\nNewcastle NE1 3XX');
  await page.click('text=+ Add a line');
  await page.fill('#q-extras .q-extra input >> nth=0', 'Delivery');
  await page.fill('#q-extras .q-extra input >> nth=1', '35');
  await save('app-quote-builder', await (await page.$('#quote-modal .modal')).screenshot());
  await doc(page, await page.evaluate(() => buildQuoteHtml()), { width: 900, height: 1180 }, 'app-quote');
  await page.context().close();

  // 4. Phone: entering parts.
  page = await appPage({ width: 390, height: 780 }, 2);
  await page.evaluate(() => { mats = [{ id: 'mat-1', selectedMatId: 102, pieces: [{ label: 'Cover', w: 600, h: 400, qty: 4 }, { label: 'Bracket', w: 300, h: 200, qty: 10 }] }]; renderAll(); });
  await page.evaluate(() => document.getElementById('block-mat-1').scrollIntoView());
  await save('app-phone', await page.screenshot(), 0.8);
  await page.context().close();

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
