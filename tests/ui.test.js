// CutNest browser tests. Run with: npm run test:ui
//
// Drives the real site in headless Chromium through the flows people actually
// use: first run, entering and pasting pieces, calculating, the library,
// Pro features, shared links, exports, and the landing and legal pages.
// Lemon Squeezy is never contacted: its API is faked per test.
//
// Needs Chromium for Playwright. Locally: npx playwright install chromium
// (already present on Claude Code cloud machines). CI installs it itself.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain', '.webp': 'image/webp' };

// Minimal static server, GitHub Pages style: "/" serves index.html.
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const STORE_ID = 394602;
const LICENCE = 'ABCD1234-EF56-7890-ABCD-1234567890AB';

let browser, base;
const results = [];

// A fresh browser context per test: empty storage, cookie banner answered,
// kerf question answered, Lemon Squeezy faked. `pro` pre-activates a licence.
async function freshPage({ pro = false, serviceWorkers = 'block', viewport } = {}) {
  const ctx = await browser.newContext({ serviceWorkers, viewport, acceptDownloads: true });
  await ctx.route('https://api.lemonsqueezy.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ valid: true, activated: true, instance: { id: 'i1' },
      license_key: { status: 'active' }, meta: { store_id: STORE_ID } })
  }));
  // Anything else off-site (analytics) is blocked so tests never depend on it.
  // (Playwright tries the newest route first, so this must not match the API.)
  await ctx.route(url => !url.href.startsWith(base) && !url.href.startsWith('data:') &&
    url.hostname !== 'api.lemonsqueezy.com', route => route.abort());
  await ctx.addInitScript(({ pro, key }) => {
    if (sessionStorage.getItem('cn-test-init')) return;
    sessionStorage.setItem('cn-test-init', '1');
    localStorage.setItem('cn-cookie', 'declined');
    localStorage.setItem('cutnest-settings-v1', JSON.stringify({ kerf: 4, kerfTouched: true }));
    if (pro) localStorage.setItem('cutnest-licence-v1',
      JSON.stringify({ key, verified: true, lastCheck: new Date().toISOString() }));
  }, { pro, key: LICENCE });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  return page;
}

function expect(cond, msg) { if (!cond) throw new Error(msg); }

async function calculateAndWait(page) {
  await page.click('#calc-btn');
  await page.waitForFunction(() => !_calcBusy && document.getElementById('output').style.display === 'block', null, { timeout: 30000 });
}

async function setPiece(page, n, w, h, qty) {
  await page.fill(`[aria-label="Piece ${n} width in mm"]`, String(w));
  await page.fill(`[aria-label="Piece ${n} height in mm"]`, String(h));
  if (qty) await page.fill(`[aria-label="Piece ${n} quantity"]`, String(qty));
}

// Loads the Sheet Metal starter pack and selects its first grade.
async function startWithMetal(page) {
  await page.goto(base + '/app.html');
  await page.click('text=Sheet Metal');
  await page.waitForFunction(() => library.length > 0 && mats[0].selectedMatId);
}

const tests = {
  async 'first run: starter pack, pieces, calculate in the worker'() {
    const page = await freshPage();
    await startWithMetal(page);
    await setPiece(page, 1, 800, 600, 6);
    await calculateAndWait(page);
    const r = await page.evaluate(() => ({
      sheets: +document.getElementById('s-sheets').textContent,
      placed: +document.getElementById('s-placed').textContent,
      worker: !!_packWorker && !_packWorkerDead
    }));
    expect(r.placed === 6, 'expected 6 pieces placed, got ' + r.placed);
    expect(r.sheets >= 1, 'expected at least one sheet');
    expect(r.worker, 'calculation should run in the worker');
    expect(await page.isVisible('#order-line'), '"What to order" line should show');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'job survives a reload'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.fill('#job-ref', 'JOB-042');
    await setPiece(page, 1, 700, 300, 3);
    await page.reload();
    await page.waitForFunction(() => library.length > 0);
    expect(await page.inputValue('#job-ref') === 'JOB-042', 'job reference lost on reload');
    expect(await page.inputValue('[aria-label="Piece 1 width in mm"]') === '700', 'piece width lost on reload');
  },

  async 'paste a cut list'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.click('text=Paste list');
    await page.fill('#paste-input', 'Door Front, 800, 600, 4\nSide Panel 450 380 6\n4 off 1,200 x 300');
    const btn = await page.textContent('#paste-confirm');
    expect(/Add 3 rows/.test(btn), 'paste preview should offer 3 rows, got: ' + btn);
    await page.click('#paste-confirm');
    const pieces = await page.evaluate(() => mats[0].pieces.map(p => [p.w, p.h, p.qty]));
    expect(JSON.stringify(pieces) === JSON.stringify([[800, 600, 4], [450, 380, 6], [1200, 300, 4]]),
      'pasted pieces wrong: ' + JSON.stringify(pieces));
  },

  async 'library: add a material and keep it after reload'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.click('button[aria-label="Stock library"]');
    await page.fill('#n-name', 'Test Ply 9mm');
    await page.fill('#n-w1', '2440');
    await page.fill('#n-h1', '1220');
    await page.fill('#n-pr1', '30');
    await page.click('#add-form-wrap >> text=+ Add');
    await page.click('text=Save Library');
    await page.reload();
    await page.waitForFunction(() => library.length > 0);
    const found = await page.evaluate(() => library.some(l => l.name === 'Test Ply 9mm'));
    expect(found, 'new material missing after reload');
  },

  async 'kerf under 1mm is kept'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.click('button[aria-label="Settings"]');
    await page.fill('#kerf-setting', '0.3');
    await page.click('#settings-modal >> text=Save');
    await page.reload();
    await page.waitForFunction(() => library.length > 0);
    expect(await page.evaluate(() => KERF) === 0.3, 'kerf should stay 0.3mm after reload');
    expect((await page.textContent('#kerf-display')).trim() === '0.3mm', 'header should show 0.3mm');
  },

  async 'free plan: Pro features are locked and explained'() {
    const page = await freshPage();
    await startWithMetal(page);
    const brushed = await page.evaluate(() => library.find(l => l.allowRotation === false).id);
    await page.selectOption('#mat-blocks select', String(brushed));
    await setPiece(page, 1, 1100, 500, 4);
    await calculateAndWait(page);
    expect((await page.textContent('#pricing-cards')).includes('Pieces may be rotated against the grain'),
      'free result must warn that grain lock was not applied');
    await page.click('.btn-add-remnant');
    expect(await page.isVisible('#upgrade-modal'), 'remnant should open the upgrade prompt');
    await page.keyboard.press('Escape');
    await page.click('.res-acts >> text=DXF');
    expect(await page.isVisible('#upgrade-modal'), 'DXF should open the upgrade prompt');
  },

  async 'licence activation unlocks Pro'() {
    const page = await freshPage();
    await page.goto(base + '/app.html');
    await page.click('button[aria-label="Settings"]');
    await page.fill('#licence-key-input', LICENCE);
    await page.click('text=Activate Key');
    await page.waitForFunction(() => isPro === true, null, { timeout: 5000 });
    expect(await page.evaluate(() => library.length) >= 20, 'Pro master library should load');
  },

  async 'Pro: grain lock holds, two materials, DXF downloads'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.selectOption('#mat-blocks select', '205');          // S/S 316 brushed: grain locked
    await setPiece(page, 1, 1100, 400, 6);
    await page.click('text=Add Another Material to This Job');
    await page.selectOption('#mat-blocks select >> nth=1', '102');  // mild steel
    await page.fill('#block-' + (await page.evaluate(() => mats[1].id)) + ' [aria-label="Piece 1 width in mm"]', '500');
    await page.fill('#block-' + (await page.evaluate(() => mats[1].id)) + ' [aria-label="Piece 1 height in mm"]', '500');
    await calculateAndWait(page);
    const r = await page.evaluate(() => ({
      materials: calcResult.results.length,
      rotatedBrushed: calcResult.results[0].sheets.some(s => s.placed.some(p => p.rotated))
    }));
    expect(r.materials === 2, 'expected 2 materials in the result');
    expect(!r.rotatedBrushed, 'grain-locked pieces must never be rotated');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=DXF')]);
    const dxf = fs.readFileSync(await dl.path(), 'utf8');
    expect(dxf.startsWith('0\r\nSECTION') && dxf.includes('AC1009') && dxf.trim().endsWith('EOF'), 'DXF is not a valid R12 file');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'CSV export'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.fill('#job-ref', 'CSV-1');
    await setPiece(page, 1, 600, 400, 2);
    await calculateAndWait(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=CSV')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    expect(csv.charCodeAt(0) === 0xFEFF, 'CSV needs a BOM for Excel');
    expect(csv.includes('PLACEMENT DETAIL') && csv.includes('Job: CSV-1'), 'CSV content missing');
  },

  async 'shared link opens the same job'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.fill('#job-ref', 'SHARE-7');
    await setPiece(page, 1, 640, 480, 5);
    const url = await page.evaluate(() => new Promise(resolve => {
      navigator.share = undefined;
      window.fallbackCopy = resolve;
      shareJob();
    }));
    const other = await freshPage();
    await other.goto(url);
    await other.waitForFunction(() => mats[0] && mats[0].pieces[0] && mats[0].pieces[0].w === 640, null, { timeout: 5000 });
    expect(await other.inputValue('#job-ref') === 'SHARE-7', 'job reference not carried by the link');
    expect(!other.url().includes('?job='), 'link payload should be removed from the address bar');
  },

  async 'calculation can be cancelled'() {
    const page = await freshPage();
    await startWithMetal(page);
    await setPiece(page, 1, 600, 400, 2);
    await calculateAndWait(page);
    // Swap in a worker that never answers, then cancel.
    await page.evaluate(() => {
      _packWorker = new Worker(URL.createObjectURL(new Blob(['onmessage=function(){}'], { type: 'text/javascript' })));
      calculate();
    });
    await page.waitForSelector('#calc-cancel', { state: 'visible', timeout: 6000 });
    await page.click('#calc-cancel');
    await page.waitForFunction(() => !_calcBusy);
    expect(await page.isVisible('#output'), 'previous results should come back after cancelling');
  },

  async 'Pro: add sheet sizes and a stock limit in the Library'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    // Custom material with one size, then two more added in the editor.
    await page.click('button[aria-label="Stock library"]');
    await page.fill('#n-name', 'Ali 3mm Test');
    await page.fill('#n-w1', '1000');
    await page.fill('#n-h1', '1000');
    await page.fill('#n-pr1', '40');
    await page.click('#add-form-wrap >> text=+ Add');
    const entry = page.locator('.lib-entry', { hasText: 'Ali 3mm Test' });
    await entry.locator('text=Edit').click();
    await entry.locator('text=+ Add sheet size').click();
    await entry.locator('[aria-label="Size 2 width in mm"]').fill('2000');
    await entry.locator('[aria-label="Size 2 height in mm"]').fill('1000');
    await entry.locator('[aria-label="Size 2 price"]').fill('70');
    await entry.locator('[aria-label="Size 2 maximum sheets available"]').fill('1');
    await entry.locator('text=+ Add sheet size').click();
    await entry.locator('[aria-label="Size 3 width in mm"]').fill('1500');
    await entry.locator('[aria-label="Size 3 height in mm"]').fill('1000');
    await entry.locator('[aria-label="Size 3 price"]').fill('55');
    await page.click('text=Save Library');
    const saved = await page.evaluate(() => library.find(l => l.name === 'Ali 3mm Test').sizes);
    expect(saved.length === 3 && saved[1].max === 1 && saved[2].price === 55, 'sizes not saved: ' + JSON.stringify(saved));
    // 4 pieces of 950x950: best is one 2000x1000 (max 1) + two 1000x1000.
    const id = await page.evaluate(() => library.find(l => l.name === 'Ali 3mm Test').id);
    await page.selectOption('#mat-blocks select', String(id));
    expect((await page.textContent('#mat-blocks')).includes('Size 3'), 'job view should list all 3 sizes');
    await setPiece(page, 1, 950, 950, 4);
    await calculateAndWait(page);
    const used = await page.evaluate(() => calcResult.results[0].sheets.map(s => s.sheetW + 'x' + s.sheetH));
    expect(used.filter(u => u === '2000x1000').length <= 1, 'stock limit of 1 big sheet broken: ' + used.join(','));
    expect(await page.evaluate(() => calcResult.results[0].unplaced.length) === 0, 'all pieces should be placed');
    // Now allow only 1 of the only size that fits a 1900x950 piece: 2 pieces cannot both go.
    await setPiece(page, 1, 1900, 950, 2);
    await calculateAndWait(page);
    expect((await page.textContent('#mat-visuals')).includes('Not enough sheets in stock'), 'should say stock ran out');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'free plan: 2 sheet sizes, and says so'() {
    const page = await freshPage();
    await page.addInitScript(() => {
      if (localStorage.getItem('cutnest-lib-v1')) return;
      localStorage.setItem('cutnest-lib-v1', JSON.stringify([{ id: 77, name: 'Three Size MDF', material: 'Timber',
        sizes: [{ w: 2440, h: 1220, price: 30 }, { w: 1220, h: 610, price: 12 }, { w: 3050, h: 1220, price: 40, max: 2 }] }]));
    });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => library.length === 1);
    await page.selectOption('#mat-blocks select', '77');
    await setPiece(page, 1, 3000, 600, 1);
    await calculateAndWait(page).catch(() => {});
    expect((await page.textContent('#err-box')).includes('too big'), 'free plan must not use the Pro-only 3rd size');
    await page.click('button[aria-label="Stock library"]');
    await page.click('#lib-entries >> text=Edit');
    await page.click('#lib-entries >> text=+ Add sheet size');
    expect(await page.isVisible('#upgrade-modal'), 'adding a 3rd size on the free plan should open the upgrade prompt');
  },

  async 'old libraries and old share links still load'() {
    const page = await freshPage();
    await page.addInitScript(() => {
      if (localStorage.getItem('cutnest-lib-v1')) return;
      localStorage.setItem('cutnest-lib-v1', JSON.stringify([{ id: 5, name: 'Legacy Steel', material: 'Mild Steel',
        size1: { w: 2450, h: 1150, price: 105 }, size2: { w: 2050, h: 900, price: 65 } }]));
    });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => library.length === 1);
    const sizes = await page.evaluate(() => library[0].sizes);
    expect(sizes.length === 2 && sizes[1].w === 2050 && sizes[1].price === 65, 'legacy size1/size2 not converted: ' + JSON.stringify(sizes));
    const v2 = { v: 2, jobRef: 'OLD-LINK', jobQty: '1', mats: [{ name: 'Old Link Steel', cuttingMethod: 'free', allowRotation: true,
      size1: { w: 2450, h: 1150, price: 100 }, size2: { w: 0, h: 0, price: 0 }, pieces: [{ w: 500, h: 400, qty: 2, label: 'A' }] }] };
    await page.goto(base + '/app.html?job=' + encodeURIComponent(Buffer.from(JSON.stringify(v2)).toString('base64')));
    await page.waitForFunction(() => mats[0] && mats[0].pieces[0].w === 500);
    const linked = await page.evaluate(() => library.find(l => l.name === 'Old Link Steel').sizes);
    expect(linked.length === 1 && linked[0].w === 2450, 'v2 link sizes not read: ' + JSON.stringify(linked));
  },

  async 'edge trim: set in the Library, used everywhere'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.click('button[aria-label="Stock library"]');
    const entry = page.locator('.lib-entry', { hasText: 'MDF 18mm' }).first();   // guillotine material
    await entry.locator('text=Edit').click();
    await entry.locator('input[data-f="trim"]').fill('10');
    await page.click('text=Save Library');
    const mdf = await page.evaluate(() => library.find(l => l.name === 'MDF 18mm'));
    expect(mdf.trim === 10, 'trim not saved: ' + mdf.trim);
    await page.selectOption('#mat-blocks select', String(mdf.id));
    expect((await page.textContent('.sz-info-row')).includes('Edge trim'), 'job view should show the edge trim');
    // 1210mm fits a 1220mm sheet, but not once 10mm comes off each edge.
    await setPiece(page, 1, 2000, 1210, 1);
    await calculateAndWait(page).catch(() => {});
    expect((await page.textContent('#err-box')).includes('edge trim'), 'oversized message should mention the trim');
    await setPiece(page, 1, 1100, 590, 4);
    await calculateAndWait(page);
    const sh = await page.evaluate(() => calcResult.results[0].sheets[0]);
    expect(sh.trim === 10 && sh.placed.every(p => p.x >= 10 && p.y >= 10 && p.x + p.w <= sh.sheetW - 10 && p.y + p.h <= sh.sheetH - 10),
      'parts must stay inside the trim');
    expect(await page.$('.sheet-canvas [title^="Edge trim"]'), 'layout should draw the trimmed edge');
    const cutSheets = await page.evaluate(() => buildCutSheetsHtml());
    expect(cutSheets.includes('First: trim 10mm off all four edges'), 'saw cut sheet should say to trim first');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=DXF')]);
    expect(fs.readFileSync(await dl.path(), 'utf8').includes('\r\nTRIM\r\n'), 'DXF should have a TRIM layer');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'grain per piece: Pro sets it, free is told'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.selectOption('#mat-blocks select', '102');              // mild steel: may rotate
    await setPiece(page, 1, 1100, 400, 6);
    await page.click('[aria-label^="Piece 1 grain"]');                  // Auto -> Lock
    expect(await page.evaluate(() => mats[0].pieces[0].grain) === 'lock', 'first click should lock the grain');
    await calculateAndWait(page);
    const rotated = await page.evaluate(() => calcResult.results[0].sheets.some(s => s.placed.some(p => p.rotated)));
    expect(!rotated, 'a grain-locked piece was rotated');
    await page.reload();
    await page.waitForFunction(() => isPro && library.length > 20);
    expect(await page.evaluate(() => mats[0].pieces[0].grain) === 'lock', 'grain setting lost on reload');

    const free = await freshPage();
    await startWithMetal(free);
    await free.click('[aria-label^="Piece 1 grain"]');
    expect(await free.isVisible('#upgrade-modal'), 'free plan: grain button should open the upgrade prompt');
  },

  async 'inches: welcome choice, fractions, exact fits, exports'() {
    const page = await freshPage({ pro: true });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('cn-units-init')) return;
      sessionStorage.setItem('cn-units-init', '1');
      localStorage.setItem('cutnest-settings-v1', JSON.stringify({ kerf: 0, kerfTouched: true, units: 'in', currency: '$' }));
    });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    // A custom 96 x 48" sheet at $60, entered in inches.
    await page.click('button[aria-label="Stock library"]');
    await page.fill('#n-name', 'Ply 4x8');
    await page.fill('#n-w1', '96');
    await page.fill('#n-h1', '48');
    await page.fill('#n-pr1', '60');
    await page.click('#add-form-wrap >> text=+ Add');
    await page.click('text=Save Library');
    const ply = await page.evaluate(() => library.find(l => l.name === 'Ply 4x8'));
    expect(Math.abs(ply.sizes[0].w - 2438.4) < 1e-9, 'sheet width should be stored in mm');
    await page.selectOption('#mat-blocks select', String(ply.id));
    expect((await page.textContent('.sz-info-row')).includes('96 \u00d7 48"'), 'size badge should read 96 x 48"');
    // Four 48 x 24" parts fill a 96 x 48" sheet exactly (kerf 0): one sheet.
    await page.fill('[aria-label="Piece 1 width in in"]', '48');
    await page.fill('[aria-label="Piece 1 height in in"]', '24');
    await page.fill('[aria-label="Piece 1 quantity"]', '4');
    await calculateAndWait(page);
    expect(await page.textContent('#s-sheets') === '1', 'four 48x24" parts should fit one 96x48" sheet exactly');
    expect((await page.textContent('#total-cost-val')).startsWith('$60.00'), 'cost should be in dollars');
    // Fractions.
    await page.fill('[aria-label="Piece 1 width in in"]', '23 5/8');
    await page.fill('[aria-label="Piece 1 height in in"]', '15-3/4');
    const w = await page.evaluate(() => mats[0].pieces[0].w);
    expect(Math.abs(w - 600.075) < 1e-9, '23 5/8" should store as 600.075mm, got ' + w);
    await calculateAndWait(page);
    const vis = await page.textContent('#mat-visuals');
    // The part may be placed either way round.
    expect(vis.includes('23 5/8 \u00d7 15 3/4"') || vis.includes('15 3/4 \u00d7 23 5/8"'),
      'results should show fractions: ' + vis.replace(/\s+/g, ' ').slice(0, 600));
    // Paste: inches by default, but a line that says mm is read in mm.
    await page.click('text=Paste list');
    await page.fill('#paste-input', 'Door, 24 1/2, 18, 2\nSide 600mm x 400mm x 1');
    await page.click('#paste-confirm');
    const pasted = await page.evaluate(() => mats[0].pieces.slice(-2).map(p => [+p.w.toFixed(3), +p.h.toFixed(3), p.qty]));
    expect(JSON.stringify(pasted) === JSON.stringify([[622.3, 457.2, 2], [600, 400, 1]]), 'paste units wrong: ' + JSON.stringify(pasted));
    // Exports carry the units.
    await calculateAndWait(page);
    const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=CSV')]);
    const csv = fs.readFileSync(await csvDl.path(), 'utf8');
    expect(csv.includes('W (in)') && csv.includes('Units: inches'), 'CSV should be in inches');
    const [dxfDl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=DXF')]);
    expect(fs.readFileSync(await dxfDl.path(), 'utf8').includes('$MEASUREMENT\r\n70\r\n0\r\n'), 'DXF should be imperial');
    // Switching back to mm changes only the display.
    await page.click('button[aria-label="Settings"]');
    await page.selectOption('#units-setting', 'mm');
    expect(await page.inputValue('[aria-label="Piece 1 width in mm"]') === '600.1', 'switching to mm should show 600.1');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'open a cut list file: CSV with headers, and Excel'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.selectOption('#mat-blocks select', '102');
    await page.click('text=Paste list');
    // Columns in an unusual order, a quoted label with a comma, a thousands separator.
    await page.setInputFiles('#paste-modal input[type=file]', { name: 'cuts.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Qty,Width,Length,Description,Grain\n2,600,"1,200","Door, left",lock\n5,300,450,Shelf,\n') });
    await page.waitForFunction(() => /Add 2 rows/.test(document.getElementById('paste-confirm').textContent));
    await page.click('#paste-confirm');
    const csvPieces = await page.evaluate(() => mats[0].pieces.map(p => [p.label, p.w, p.h, p.qty, p.grain || '']));
    expect(JSON.stringify(csvPieces) === JSON.stringify([['Door, left', 1200, 600, 2, 'lock'], ['Shelf', 450, 300, 5, '']]),
      'CSV import wrong: ' + JSON.stringify(csvPieces));
    // Excel (.xlsx built by tests/import.test.js).
    await page.click('text=Paste list');
    await page.check('#paste-replace');
    await page.setInputFiles('#paste-modal input[type=file]', path.join(__dirname, 'fixtures', 'cutlist.xlsx'));
    await page.waitForFunction(() => /Add 3 rows/.test(document.getElementById('paste-confirm').textContent));
    await page.click('#paste-confirm');
    const xl = await page.evaluate(() => mats[0].pieces.map(p => [p.label, p.w, p.h, p.qty, p.grain || '']));
    expect(JSON.stringify(xl) === JSON.stringify([['Door & Frame', 800, 600, 4, 'lock'], ['Shelf', 450.5, 380, 6, ''], ['', 700, 280, 1, '']]),
      'Excel import wrong: ' + JSON.stringify(xl));
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'library backup and restore'() {
    const page = await freshPage();
    await startWithMetal(page);
    await page.evaluate(() => { settings.companyName = 'Backup Test Ltd'; localStorage.setItem(SETT_KEY, JSON.stringify(settings)); });
    await page.click('button[aria-label="Stock library"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Back up')]);
    const file = await dl.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(backup.kind === 'cutnest-backup' && backup.library.length === 3, 'backup should hold the 3 starter materials');
    expect(!JSON.stringify(backup).includes('licence'), 'backup must not contain the licence key');
    // A fresh browser: restore it.
    const other = await freshPage();
    await other.goto(base + '/app.html');
    await other.click('button[aria-label="Stock library"]');
    other.once('dialog', d => d.accept());
    await other.setInputFiles('#lib-modal input[type=file]', file);
    await other.waitForFunction(() => library.length === 3, null, { timeout: 5000 });
    expect(await other.evaluate(() => settings.companyName) === 'Backup Test Ltd', 'settings not restored');
    expect(await other.evaluate(() => library.map(l => l.name).join()) === await page.evaluate(() => library.map(l => l.name).join()),
      'restored library differs');
    expect(!other.errors.length, 'page errors: ' + other.errors.join(' | '));
  },

  async 'part labels: Pro prints, free is offered the upgrade'() {
    const free = await freshPage();
    await startWithMetal(free);
    await setPiece(free, 1, 800, 600, 2);
    await calculateAndWait(free);
    await free.click('.res-acts >> text=Labels');
    expect(await free.isVisible('#upgrade-modal'), 'free plan should see the upgrade window for labels');
    expect(!(await free.isVisible('#labels-modal')), 'free plan should not get the labels window');

    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.selectOption('#mat-blocks select', '205');
    await page.fill('#job-ref', 'JOB-047');
    await page.evaluate(() => { mats[0].pieces = [{ w: 800, h: 600, qty: 2, label: 'Door Front' }, { w: 450, h: 380, qty: 4, label: 'Side <Panel>' }]; renderAll(); });
    await calculateAndWait(page);
    await page.click('.res-acts >> text=Labels');
    expect(await page.isVisible('#labels-modal'), 'labels window should open for Pro');
    expect(/^6 labels on 1 sheet of 21\./.test(await page.textContent('#labels-summary')), 'summary wrong: ' + await page.textContent('#labels-summary'));
    await page.fill('#label-skip', '19');
    await page.dispatchEvent('#label-skip', 'input');
    expect(/6 labels on 2 sheets of 21, starting at label 20/.test(await page.textContent('#labels-summary')), 'skip not counted: ' + await page.textContent('#labels-summary'));
    const html = await page.evaluate(() => buildLabelsHtml('L7160', 0));
    expect((html.match(/class="lb"/g) || []).length === 6, 'expected 6 labels in the output');
    expect(html.includes('Sheet 1 \u00b7 Part 1') || html.includes('Sheet 1 &middot; Part 1') || html.includes('Sheet 1 · Part 1'), 'labels should carry the cut-sheet numbers');
    expect(html.includes('JOB-047') && html.includes('Side &lt;Panel&gt;'), 'labels should show the job and escape part names');
    expect(html.includes('size: A4'), 'Avery L7160 should print on A4');
    await page.keyboard.press('Escape');
    expect(!(await page.isVisible('#labels-modal')), 'Escape should close the labels window');
    expect(!page.errors.length && !free.errors.length, 'page errors: ' + page.errors.concat(free.errors).join(' | '));
  },

  async 'quote: Pro prices the job, remembers it, numbers it; free is offered the upgrade'() {
    const free = await freshPage();
    await startWithMetal(free);
    await setPiece(free, 1, 800, 600, 2);
    await calculateAndWait(free);
    await free.click('.res-acts >> text=Quote');
    expect(await free.isVisible('#upgrade-modal'), 'free plan should see the upgrade window for quotes');

    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.selectOption('#mat-blocks select', '601');                // MDF 18mm: saw / guillotine
    await page.fill('#job-qty', '2');
    await setPiece(page, 1, 800, 600, 3);
    await calculateAndWait(page);
    await page.click('text=Build a customer quote');
    expect(await page.isVisible('#quote-modal'), 'quote window should open');
    expect(await page.inputValue('#q-no') === 'Q-0001', 'first quote should be numbered Q-0001');
    await page.fill('#q-customer', 'Harper <Joinery>');
    await page.fill('#q-mrate', '90');
    await page.fill('#q-speed-0', '10');
    await page.click('text=+ Add a line');
    await page.fill('#q-extras .q-extra input >> nth=0', 'Delivery');
    await page.fill('#q-extras .q-extra input >> nth=1', '40');
    const f = await page.evaluate(() => currentFigures());
    expect(f.cutting > 0 && f.materialPrice > 0 && f.extrasTotal === 40, 'figures missing: ' + JSON.stringify([f.cutting, f.materialPrice, f.extrasTotal]));
    expect(Math.abs(f.total - (f.subtotal * 1.2)) < 0.011, 'VAT at 20% should be added');
    expect(await page.textContent('#qs-total') === await page.evaluate(t => money(t), f.total), 'summary total should match the figures');
    expect(f.jobQty === 2 && /per unit/.test(await page.textContent('#quote-summary')), 'price per unit should show for 2 units');
    expect(f.mats[0].method === 'guillotine' && f.mats[0].cuts >= 3, 'saw job should count its cut sequence');
    const html = await page.evaluate(() => buildQuoteHtml());
    expect(html.includes('QUOTATION') && html.includes('Harper &lt;Joinery&gt;') && html.includes('Delivery'), 'printed quote should carry the customer (escaped) and extras');
    expect(html.includes('size: A4'), 'metric quote prints on A4');

    // A logo is scaled down in the browser and printed in the header.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9QzwAEjDAGNzYAAB2DA/2y7c3tAAAAAElFTkSuQmCC', 'base64');
    await page.setInputFiles('.q-file input[type=file]', { name: 'logo.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => /^data:image\/png;base64,/.test(quoteSettings().logo));
    expect(await page.isVisible('#q-logo-prev img'), 'logo preview should show');
    expect((await page.evaluate(() => buildQuoteHtml())).includes('<img src="data:image/png'), 'logo should be on the quote');

    // Printing uses the number up; the next job gets the next one.
    await page.evaluate(() => { window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {} }); });
    await page.click('#quote-modal >> text=Print / save PDF');
    expect(await page.evaluate(() => autoQuoteNo()) === 'Q-0002', 'next quote number should be Q-0002');

    // The customer and extras belong to the job; the speed belongs to the material.
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => isPro && library.length > 20);
    const kept = await page.evaluate(() => ({ q: quoteJob, speed: library.find(l => l.id == 601).cutSpeed, rate: quoteSettings().machineRate }));
    expect(kept.q && kept.q.customer === 'Harper <Joinery>' && kept.q.no === 'Q-0001' && kept.q.extras.length === 1, 'quote details lost on reload: ' + JSON.stringify(kept.q));
    expect(kept.speed === 10000, 'cutting speed should be saved to the material, got ' + kept.speed);
    expect(kept.rate === 90, 'machine rate should be saved');
    page.on('dialog', d => d.accept());
    await page.click('text=New job');
    expect(await page.evaluate(() => quoteJob) === null, 'New job should clear the quote details');
    await page.keyboard.press('Escape');
    expect(!page.errors.length && !free.errors.length, 'page errors: ' + page.errors.concat(free.errors).join(' | '));
  },

  async 'bars: free starter pack, paste lengths, cutting plan, CSV and cut sheets'() {
    const page = await freshPage();
    await page.goto(base + '/app.html');
    await page.click('text=Bar & Tube');
    await page.waitForFunction(() => library.length > 0 && mats[0].selectedMatId && isLinear(library[0]));
    expect(await page.isVisible('[aria-label="Piece 1 length in mm"]'), 'bar material should ask for a length');
    expect(!(await page.isVisible('[aria-label="Piece 1 height in mm"]')), 'bar material should not ask for a height');
    await page.click('text=Paste list');
    await page.fill('#paste-input', 'Top rail, 2400, 4\nLeg 900 x 8\n4 off 1150\nBrace 650 6');
    expect(/Add 4 rows/.test(await page.textContent('#paste-confirm')), 'paste should read 4 length rows');
    await page.click('#paste-confirm');
    await calculateAndWait(page);
    const r = await page.evaluate(() => {
      const res = calcResult.results[0];
      return { linear: res.linear, bars: res.sheets.length, placed: res.sheets.reduce((a, s) => a + s.placed.length, 0),
               order: document.getElementById('order-line-text').textContent, label: document.getElementById('s-sheets').previousElementSibling.textContent,
               groups: document.querySelectorAll('.bar-group').length };
    });
    expect(r.linear && r.placed === 22, 'all 22 parts should be cut from bars: ' + JSON.stringify(r));
    expect(/mm SHS 40x40x3/.test(r.order) && !/×1mm/.test(r.order), 'order line should list bar lengths: ' + r.order);
    expect(r.label === 'Bars' && r.groups >= 1, 'results should talk about bars');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.res-acts >> text=CSV')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    expect(/Bar 1,/.test(csv) && !/x1 /.test(csv), 'CSV should list parts by bar');
    const cut = await page.evaluate(() => buildCutSheetsHtml());
    expect(/cutting list/.test(cut) && /Pull from stock/.test(cut) && /Mark from end/.test(cut), 'cut sheets should carry the saw list');
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'bars: Pro adds a bar material, mixes it with sheet, quotes, labels, shares'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.click('button[aria-label="Stock library"]');
    await page.click('#add-form-wrap [data-kind="linear"]');
    expect(!(await page.isVisible('#n-h1')), 'bar form should hide the height');
    await page.fill('#n-name', 'Flat 50x6 test');
    await page.fill('#n-w1', '6000'); await page.fill('#n-pr1', '20');
    await page.fill('#n-w2', '3000'); await page.fill('#n-pr2', '11');
    await page.click('#add-form-wrap >> text=+ Add');
    const id = await page.evaluate(() => pending.find(e => e.name === 'Flat 50x6 test').id);
    await page.evaluate(i => toggleEdit(i), id);
    await page.fill(`#trim-${id}`, '10');
    await page.fill(`#kerf-${id}`, '2');
    await page.click('text=Save Library');
    await page.waitForFunction(i => { const e = library.find(l => l.id === i); return e && e.kind === 'linear' && e.trim === 10 && e.kerf === 2; }, id);
    await page.evaluate(i => {
      mats = [{ id: 'mat-1', selectedMatId: 601, pieces: [{ w: 800, h: 600, qty: 2, label: 'Door' }] },
              { id: 'mat-2', selectedMatId: i, pieces: [{ w: 1000, h: '', qty: 7, label: 'Rail' }, { w: 450, h: '', qty: 3, label: 'Post' }] }];
      renderAll();
    }, id);
    await page.fill('#job-ref', 'JOB-BAR');
    await calculateAndWait(page);
    const r = await page.evaluate(() => {
      const b = calcResult.results[1];
      return { sm: b.sizeMap, kerf: b.kerf, first: b.sheets[0].placed[0].x, v: optimalityVerdict(b), label: document.getElementById('s-sheets').previousElementSibling.textContent };
    });
    expect(JSON.stringify(r.sm) === JSON.stringify({ '6000×1': 1, '3000×1': 1 }), 'Pro should pick one 6m and one 3m bar (cheapest): ' + JSON.stringify(r.sm));
    expect(r.kerf === 2 && r.first === 10, 'bar kerf and end trim should be used');
    expect(r.label === 'Sheets & bars', 'mixed job should say sheets and bars');
    const q = await page.evaluate(() => { ensureQuoteJob(); return currentFigures().mats[1]; });
    // 6m bar: squaring cut + 7 parts; 3m bar: squaring cut + 3 parts (none end exactly at the bar end).
    expect(q.method === 'linear' && q.cuts === (1 + 7) + (1 + 3) && q.cutLength === 0, 'bar quote should count saw cuts: ' + JSON.stringify([q.method, q.cuts]));
    const labels = await page.evaluate(() => buildLabelsHtml('L7160', 0));
    expect(labels.includes('Bar 1 \u00b7 Part 1') || labels.includes('Bar 1 · Part 1'), 'labels should number bar parts');
    expect(!/450×1mm|1000×1mm/.test(labels) && !/Rail[\s\S]{0,400}GRAIN LOCKED/.test(labels), 'bar labels show lengths and no grain flag');
    const dxf = await page.evaluate(() => buildDXF(calcResult.results.filter(r => !r.linear)));
    expect(dxf.includes('MDF') && !dxf.includes('Flat 50x6'), 'DXF should hold only the sheet layout');
    // Share link round trip keeps the bar material.
    let url = null;
    await page.evaluate(() => { navigator.share = undefined; });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('.res-acts >> text=Share');
    url = await page.evaluate(() => navigator.clipboard.readText());
    expect(/\?job=/.test(url), 'share link should be copied');
    const p2 = await freshPage({ pro: true });
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, base));
    await p2.waitForFunction(() => mats.length === 2 && library.some(l => l._transient && l.kind === 'linear'));
    const shared = await p2.evaluate(() => { const l = library.find(x => x._transient && x.kind === 'linear'); return { kerf: l.kerf, trim: l.trim, sizes: l.sizes.map(z => z.w + 'x' + z.h), pieces: mats[1].pieces.length }; });
    expect(shared.kerf === 2 && shared.trim === 10 && shared.sizes.join() === '6000x1,3000x1' && shared.pieces === 2, 'shared bar material wrong: ' + JSON.stringify(shared));
    expect(!page.errors.length && !p2.errors.length, 'page errors: ' + page.errors.concat(p2.errors).join(' | '));
  },

  async 'bars: a part longer than every bar is reported, not lost'() {
    const page = await freshPage({ pro: true });
    await page.goto(base + '/app.html');
    await page.waitForFunction(() => isPro && library.length > 20);
    await page.evaluate(() => { mats = [{ id: 'mat-1', selectedMatId: 805, pieces: [{ w: 6500, h: '', qty: 1, label: 'Beam' }, { w: 1000, h: '', qty: 2, label: 'Stub' }] }]; renderAll(); });
    await calculateAndWait(page);
    const txt = await page.textContent('#mat-visuals');
    expect(/1 PIECE NOT PLACED/.test(txt) && /Longer than every stock length/.test(txt), 'long part should be reported');
    expect(await page.evaluate(() => calcResult.results[0].sheets.reduce((a, s) => a + s.placed.length, 0)) === 2, 'the parts that fit are still cut');
  },

  async 'landing page, FAQ and legal pages'() {
    const page = await freshPage({ viewport: { width: 390, height: 800 } });
    await page.goto(base + '/');
    await page.focus('.faq-q >> nth=0');
    await page.keyboard.press('Enter');
    expect(await page.getAttribute('.faq-q >> nth=0', 'aria-expanded') === 'true', 'FAQ should open from the keyboard');
    const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type']));
    expect(ld.includes('FAQPage'), 'FAQ structured data missing');
    for (const f of ['/terms.html', '/privacy.html']) {
      const res = await page.goto(base + f);
      expect(res.status() === 200, f + ' returned ' + res.status());
    }
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'website: every page loads clean, and every internal link and anchor resolves'() {
    const page = await freshPage();
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const pages = [...sitemap.matchAll(/<loc>https:\/\/cutnest\.co\.uk([^<]*)<\/loc>/g)].map(m => m[1]);
    expect(pages.length >= 11, 'sitemap should list the content pages, got ' + pages.length);
    const links = new Set(), anchors = [];
    for (const p of pages) {
      const res = await page.goto(base + p);
      expect(res.status() === 200, p + ' returned ' + res.status());
      const info = await page.evaluate(() => ({
        title: document.title, h1: document.querySelectorAll('h1').length,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { JSON.parse(s.textContent); return true; } catch (e) { return false; } }),
        refs: [...document.querySelectorAll('a[href], img[src], script[src], link[href]')].map(e => e.getAttribute('href') || e.getAttribute('src'))
      }));
      expect(info.title.length > 10 && info.h1 === 1, p + ': needs a title and exactly one h1 (has ' + info.h1 + ')');
      expect(p === '/terms.html' || p === '/privacy.html' || info.canonical === 'https://cutnest.co.uk' + p, p + ': canonical is ' + info.canonical);
      expect(info.ld.every(Boolean), p + ': invalid JSON-LD');
      info.refs.forEach(r => {
        if (!r || /^(mailto:|https?:|data:|#|javascript:)/.test(r)) return;
        const u = new URL(r, base + p);
        if (u.hash && u.hash.length > 1) anchors.push([u.pathname, u.hash.slice(1), p]);
        links.add(u.pathname);
      });
    }
    for (const l of links) {
      const res = await page.request.get(base + l);
      expect(res.status() === 200, 'broken link ' + l + ' (' + res.status() + ')');
    }
    for (const [pathname, id, from] of anchors) {
      const html = fs.readFileSync(path.join(ROOT, pathname === '/' ? 'index.html' : pathname.slice(1)), 'utf8');
      expect(html.includes('id="' + id + '"'), 'link from ' + from + ' to ' + pathname + '#' + id + ': no such anchor');
    }
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'website: live demo runs the real engine and opens the job in the app'() {
    const page = await freshPage();
    await page.goto(base + '/');
    await page.waitForSelector('#demo .cnd-head', { timeout: 20000 });
    expect(/Provably optimal/.test(await page.textContent('#demo .cnd-out')), 'the sample job should be proved optimal');
    await page.fill('#demo [aria-label="Part 1 quantity"]', '12');
    await page.click('#demo .cnd-go');
    // More covers than one sheet holds: the plan grows (cheapest mix, so not always the big sheet).
    await page.waitForFunction(() => /^[2-9]\s*sheets/.test(document.querySelector('#demo .cnd-n').textContent), null, { timeout: 20000 });
    await page.click('#demo .cnd-tab[data-k="bar"]');
    await page.waitForFunction(() => /bars/.test(document.querySelector('#demo .cnd-n').textContent), null, { timeout: 20000 });
    expect(await page.$$eval('#demo .cnd-sheets.lin figure', f => f.length) === 3, 'bar sample should need 3 bars');
    const href = await page.getAttribute('#demo .cnd-open', 'href');
    await page.goto(base + href);
    await page.waitForFunction(() => mats.length === 1 && library.some(l => l._transient && l.kind === 'linear'));
    const job = await page.evaluate(() => ({ ref: document.getElementById('job-ref').value, n: mats[0].pieces.length, w: mats[0].pieces[0].w }));
    expect(/Demo/.test(job.ref) && job.n === 3 && job.w === 2400, 'demo job should open in the app: ' + JSON.stringify(job));
    // The how-many-sheets calculator compares the nest with the area sum.
    await page.goto(base + '/guides/how-many-sheets.html');
    await page.waitForSelector('.cnd-cmp', { timeout: 20000 });
    expect(/Area estimate: 2 · real nest: 3/.test(await page.textContent('.cnd-cmp')), 'calculator should show the area sum falling short: ' + await page.textContent('.cnd-cmp'));
    expect(!page.errors.length, 'page errors: ' + page.errors.join(' | '));
  },

  async 'website: analytics only after consent'() {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const gaHits = [];
    await ctx.route(u => !u.href.startsWith(base), r => { if (/googletagmanager|google-analytics/.test(r.request().url())) gaHits.push(r.request().url()); r.abort(); });
    const page = await ctx.newPage();
    await page.goto(base + '/sheet-metal.html');
    await page.waitForSelector('#cookie.show', { timeout: 5000 });
    await page.waitForTimeout(300);
    expect(!gaHits.length, 'Google Analytics requested before consent');
    expect(await page.evaluate(() => { cnTrack('test_event'); return window.dataLayer.length; }) === 0, 'events must not be queued without consent');
    await page.click('#cookie >> text=Decline analytics');
    await page.goto(base + '/app.html');
    await page.waitForTimeout(500);
    expect(!gaHits.length, 'Google Analytics requested after declining');
    await page.evaluate(() => localStorage.removeItem('cn-cookie'));
    await page.goto(base + '/');
    await page.waitForSelector('#cookie.show', { timeout: 5000 });
    await page.click('#cookie >> text=Accept');
    await page.waitForTimeout(300);
    expect(gaHits.length === 1, 'Google Analytics should load once after Accept, got ' + gaHits.length);
    await ctx.close();
  },

  async 'offline cache installs (no missing files)'() {
    const page = await freshPage({ serviceWorkers: 'allow' });
    await page.goto(base + '/');
    const ok = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const c = await caches.open(keys[0]);
      return { active: !!reg.active, entries: (await c.keys()).length };
    });
    expect(ok.active, 'service worker did not activate (a precached file is probably missing)');
    // Every script and stylesheet app.html loads must be available offline.
    const missing = await page.evaluate(async () => {
      const html = await (await fetch('/app.html')).text();
      const refs = [...html.matchAll(/(?:src|href)="(\/(?:js|css|fonts)\/[^"]+)"/g)].map(m => m[1]);
      const c = await caches.open((await caches.keys())[0]);
      const out = [];
      for (const r of refs) if (!(await c.match(r))) out.push(r);
      return out;
    });
    expect(!missing.length, 'not in the offline cache: ' + missing.join(', '));
    expect(ok.entries > 10, 'expected the precache to be filled, got ' + ok.entries);
  }
};

(async () => {
  const server = await serve();
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch();
  const only = process.argv[2];
  for (const [name, fn] of Object.entries(tests)) {
    if (only && !name.includes(only)) continue;
    const t0 = Date.now();
    try {
      await fn();
      results.push([true, name]);
      console.log(`  ok   ${name} (${Date.now() - t0}ms)`);
    } catch (e) {
      results.push([false, name]);
      console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`); if (process.env.DEBUG) console.log(e.stack);
    }
    for (const ctx of browser.contexts()) await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length} browser tests, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
