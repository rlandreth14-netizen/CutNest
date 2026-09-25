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
  '.txt': 'text/plain' };

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
      console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`);
    }
    for (const ctx of browser.contexts()) await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length} browser tests, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
