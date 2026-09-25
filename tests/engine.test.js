// CutNest engine tests. Run with: npm test   (or: node tests/engine.test.js)
//
// The engine lives in js/engine.js, the same file the page and the packing
// worker load. There is no copy to drift: whatever ships is what gets tested.
//
// What is checked, on hand-picked cases and on seeded random jobs:
//   - every piece is placed exactly once, or reported as unplaced
//   - pieces stay inside the sheet and never overlap
//   - every pair of pieces is at least one kerf apart
//   - grain lock is never broken, and the "rotated" flag tells the truth
//   - guillotine layouts can always be sawn (a cut sequence exists)
//   - no more sheets of a size are used than its stock limit allows
//   - with edge trim, no part comes within the trim of a sheet edge
//   - big jobs of small parts finish in reasonable time

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');

const ctx = { settings: { minOffcutLong: 1000, minOffcutShort: 300 } };
vm.createContext(ctx);
vm.runInContext('var KERF = 4, PACK_EFFORT = 8;\n' + engineSrc +
  '\nthis.E = { runMat, packJob, stockSizes, deriveGuillotineCuts, largestEmptyRect, maxRectsPack };' +
  '\nthis.setKerf = function (k) { KERF = k; };', ctx);
const E = ctx.E;

let failures = 0, checks = 0;
function fail(name, msg) { failures++; console.error('  FAIL ' + name + ': ' + msg); }
function ok(cond, name, msg) { checks++; if (!cond) fail(name, msg); }

function material(opts) {
  return Object.assign({
    name: 'Test', cuttingMethod: 'free', allowRotation: true,
    size1: { w: 2450, h: 1150, price: 100 }, size2: { w: 0, h: 0, price: 0 }
  }, opts || {});
}

// Checks every invariant on one result. Returns nothing; records failures.
function checkLayout(name, lib, pieces, res, kerf) {
  const EPS = 1e-6;
  const total = pieces.reduce((a, p) => a + p.qty, 0);
  const placed = res.sheets.reduce((a, s) => a + s.placed.length, 0);
  ok(placed + res.unplaced.length === total, name, `placed ${placed} + unplaced ${res.unplaced.length} != ${total}`);
  const seen = new Set();
  for (const s of res.sheets) {
    for (const p of s.placed) {
      const key = p.pieceIndex + '-' + p.instanceIndex;
      ok(!seen.has(key), name, 'piece placed twice: ' + key); seen.add(key);
      const t = s.isRemnant ? 0 : (+lib.trim || 0);
      ok(p.x >= t - EPS && p.y >= t - EPS && p.x + p.w <= s.sheetW - t + EPS && p.y + p.h <= s.sheetH - t + EPS,
         name, `piece outside ${s.sheetW}x${s.sheetH} sheet (trim ${t}) at ${p.x},${p.y}`);
      const o = pieces[p.pieceIndex];
      const same = p.w === o.w && p.h === o.h, swapped = p.w === o.h && p.h === o.w;
      ok(same || swapped, name, 'piece dimensions changed');
      const locked = o.grain === 'lock' || (o.grain !== 'free' && lib.allowRotation === false);
      if (locked) ok(same, name, 'piece rotated although its grain is locked');
      ok(p.rotated === (!same && swapped), name, 'rotated flag does not match the placement');
    }
    for (let i = 0; i < s.placed.length; i++) {
      for (let j = i + 1; j < s.placed.length; j++) {
        const a = s.placed[i], b = s.placed[j];
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        if (Math.max(gapX, gapY) < kerf - EPS) {
          fail(name, `pieces closer than the ${kerf}mm kerf (gap ${Math.max(gapX, gapY)})`);
          return;
        }
      }
    }
    if (!s.isRemnant) {
      ok(E.stockSizes(lib).some(z => z.w === s.sheetW && z.h === s.sheetH), name,
         `sheet ${s.sheetW}x${s.sheetH} is not one of the material's sizes`);
    }
    if (lib.cuttingMethod === 'guillotine') {
      // Cuts are worked out on the trimmed sheet, as the saw sees it.
      const t = s.trim || 0;
      const inner = s.placed.map(p => Object.assign({}, p, { x: p.x - t, y: p.y - t }));
      const cuts = E.deriveGuillotineCuts(inner, s.sheetW - 2 * t, s.sheetH - 2 * t, kerf);
      ok(!!cuts, name, 'guillotine sheet has no valid cut sequence');
      if (cuts) checkCutFree(name, inner, cuts, s.sheetW - 2 * t, s.sheetH - 2 * t, kerf);
    }
  }
}

// Every part must come out of the cut sequence free of waste: each of its four
// edges is a sheet edge or lies on a cut that runs the full length of that
// edge. (Waste thinner than the kerf is sawdust and needs no cut.)
function checkCutFree(name, parts, cuts, W, H, kerf) {
  const E2 = 1e-6;
  for (const p of parts) {
    const along = (axis, lo, hi) => c => c.axis === axis && c.from <= lo + E2 && c.to >= hi - E2;
    const nearOk = (axis, edge, lo, hi) => edge <= kerf + E2 ||
      cuts.some(c => along(axis, lo, hi)(c) && edge - (c.pos + kerf) >= -E2 && edge - (c.pos + kerf) <= kerf + E2);
    const farOk = (axis, edge, size, lo, hi) => Math.abs(size - edge) < E2 ||
      cuts.some(c => along(axis, lo, hi)(c) && Math.abs(c.pos - edge) < E2);
    const bad = !nearOk('V', p.x, p.y, p.y + p.h) ? 'left' : !farOk('V', p.x + p.w, W, p.y, p.y + p.h) ? 'right'
      : !nearOk('H', p.y, p.x, p.x + p.w) ? 'top' : !farOk('H', p.y + p.h, H, p.x, p.x + p.w) ? 'bottom' : null;
    if (bad) { fail(name, `part ${p.w}x${p.h} at ${p.x},${p.y}: its ${bad} edge is never cut`); return; }
  }
  checks++;
}

function checkStock(name, lib, res) {
  const used = {};
  res.sheets.forEach(s => { if (!s.isRemnant) used[s.sheetW + 'x' + s.sheetH] = (used[s.sheetW + 'x' + s.sheetH] || 0) + 1; });
  E.stockSizes(lib).forEach(z => {
    if (z.max != null) ok((used[z.w + 'x' + z.h] || 0) <= z.max, name, `used ${used[z.w + 'x' + z.h]} sheets of ${z.w}x${z.h}, only ${z.max} allowed`);
  });
  ok(!res.stockShort || res.unplaced.length > 0, name, 'stockShort set but nothing is unplaced');
}

function run(name, lib, pieces, kerf) {
  ctx.setKerf(kerf);
  const res = E.packJob(lib, pieces, null, 1);
  checkLayout(name, lib, pieces, res, kerf);
  checkStock(name, lib, res);
  return res;
}

// ── Hand-picked cases ─────────────────────────────────────────────
console.log('Known cases');
{
  // Two 1000mm parts need 1000 + 4 + 1000 = 2004mm with a 4mm kerf.
  const lib = material({ size1: { w: 2004, h: 500, price: 10 } });
  let res = run('kerf exactly fits', lib, [{ w: 1000, h: 500, qty: 2, label: 'A' }], 4);
  ok(res.sheets.length === 1, 'kerf exactly fits', `expected 1 sheet, got ${res.sheets.length}`);
  res = run('kerf just too tight', material({ size1: { w: 2003, h: 500, price: 10 } }), [{ w: 1000, h: 500, qty: 2, label: 'A' }], 4);
  ok(res.sheets.length === 2, 'kerf just too tight', `expected 2 sheets, got ${res.sheets.length}`);
  res = run('zero kerf', material({ size1: { w: 2000, h: 500, price: 10 } }), [{ w: 1000, h: 500, qty: 2, label: 'A' }], 0);
  ok(res.sheets.length === 1, 'zero kerf', `expected 1 sheet, got ${res.sheets.length}`);
}
{
  // Only fits turned 90 degrees: allowed normally, never with grain locked.
  const pieces = [{ w: 1100, h: 2000, qty: 1, label: 'Tall' }];
  let res = run('rotation allowed', material(), pieces, 4);
  ok(res.sheets.length === 1 && res.sheets[0].placed[0].rotated === true, 'rotation allowed', 'expected one rotated piece');
  res = run('grain locked', material({ allowRotation: false }), pieces, 4);
  ok(res.sheets.every(s => s.placed.length === 0) || res.unplaced.length === 1, 'grain locked', 'grain-locked piece must not be rotated to fit');
}
{
  // An empty sheet is one big offcut; a part in the corner leaves the rest.
  ctx.setKerf(4);
  const r = E.largestEmptyRect(2000, 1000, [{ x: 0, y: 0, w: 500, h: 1000 }]);
  ok(r.x === 504 && r.w === 1496 && r.h === 1000, 'offcut beside a part', JSON.stringify(r));
}

{
  // Sheet sizes: old size1/size2 libraries read the same as sizes[].
  const legacy = E.stockSizes({ size1: { w: 2450, h: 1150, price: 100 }, size2: { w: 0, h: 0, price: 0 } });
  ok(legacy.length === 1 && legacy[0].w === 2450 && legacy[0].max === null, 'legacy sizes', JSON.stringify(legacy));
  const dup = E.stockSizes({ sizes: [{ w: 1000, h: 500 }, { w: 1000, h: 500 }, { w: 0, h: 5 }, { w: 800, h: 400, max: '3' }] });
  ok(dup.length === 2 && dup[1].max === 3, 'sizes are cleaned', JSON.stringify(dup));
}
{
  // Stock limit: only 2 big sheets, so the rest must go on the small size.
  const lib = material({ sizes: [{ w: 2000, h: 1000, price: 50, max: 2 }, { w: 1000, h: 1000, price: 40 }] });
  const res = run('stock limit spills to next size', lib, [{ w: 900, h: 900, qty: 7, label: 'Sq' }], 4);
  const big = res.sheets.filter(s => s.sheetW === 2000).length;
  ok(big <= 2 && res.unplaced.length === 0, 'stock limit spills to next size', `big sheets ${big}, unplaced ${res.unplaced.length}`);
}
{
  // Stock runs out completely: pieces are left over and the reason is stock.
  const lib = material({ sizes: [{ w: 1000, h: 1000, price: 40, max: 2 }] });
  const res = run('stock runs out', lib, [{ w: 900, h: 900, qty: 5, label: 'Sq' }], 4);
  ok(res.sheets.length === 2 && res.unplaced.length === 3 && res.stockShort === true, 'stock runs out',
     `sheets ${res.sheets.length}, unplaced ${res.unplaced.length}, stockShort ${res.stockShort}`);
}
{
  // More than two sizes: the cheapest way to cut 4 of 1200x1200 is 4 of the
  // 1250x1250 sheets (4 x 20), not 2 of the big 2500x1250 (2 x 60).
  const lib = material({ sizes: [{ w: 2500, h: 1250, price: 60 }, { w: 1250, h: 1250, price: 20 }, { w: 3000, h: 1500, price: 90 }] });
  const res = run('cheapest of three sizes', lib, [{ w: 1200, h: 1200, qty: 4, label: 'Big' }], 4);
  const cost = res.sheets.reduce((a, s) => a + E.stockSizes(lib).find(z => z.w === s.sheetW && z.h === s.sheetH).price, 0);
  ok(cost === 80, 'cheapest of three sizes', 'expected £80, got £' + cost);
}

{
  // Edge trim: 10mm off each edge of a 1000mm sheet leaves 980mm, which takes
  // two 490mm parts side by side with no kerf. 11mm leaves 978mm: it does not.
  const pieces = [{ w: 490, h: 490, qty: 4, label: 'Q' }];
  let res = run('trim 10mm', material({ trim: 10, sizes: [{ w: 1000, h: 1000, price: 10 }] }), pieces, 0);
  ok(res.sheets.length === 1, 'trim 10mm', `expected 1 sheet, got ${res.sheets.length}`);
  ok(res.sheets[0].sheetW === 1000 && res.sheets[0].trim === 10, 'trim 10mm', 'sheet should be reported at full size');
  ok(Object.keys(res.sizeMap)[0] === '1000\u00d71000', 'trim 10mm', 'order list should use the full sheet size: ' + JSON.stringify(res.sizeMap));
  res = run('trim 11mm', material({ trim: 11, sizes: [{ w: 1000, h: 1000, price: 10 }] }), pieces, 0);
  ok(res.sheets.length === 4, 'trim 11mm', `expected 4 sheets, got ${res.sheets.length}`);
}

{
  // Grain per piece. Grain-locked material, but a hidden back panel may turn:
  // it only fits turned, so it must be placed rotated.
  let res = run('piece may turn on locked material', material({ allowRotation: false }),
    [{ w: 1100, h: 2000, qty: 1, label: 'Back', grain: 'free' }], 4);
  ok(res.unplaced.length === 0 && res.sheets[0].placed[0].rotated === true, 'piece may turn on locked material', 'expected one rotated piece');
  // Free material, one locked piece: it must never turn, the others may.
  res = run('locked piece on free material', material(),
    [{ w: 1100, h: 400, qty: 6, label: 'Door', grain: 'lock' }, { w: 300, h: 1000, qty: 6, label: 'Shelf' }], 4);
  ok(res.sheets.every(s => s.placed.every(p => p.pieceIndex !== 0 || !p.rotated)), 'locked piece on free material', 'a grain-locked piece was rotated');
}

// ── Seeded random jobs ────────────────────────────────────────────
console.log('Random jobs');
let seed = 20260925;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const JOBS = +(process.env.CUTNEST_JOBS || 80);
for (let t = 0; t < JOBS; t++) {
  const kerf = [0, 0.3, 3, 4, 5, 18][ri(0, 5)];
  const priced = rnd() < 0.5;
  let sizeSpec;
  if (rnd() < 0.5) {
    sizeSpec = { size1: { w: 2450, h: 1150, price: priced ? 100 : 0 },
                 size2: rnd() < 0.6 ? { w: 1950, h: 900, price: 60 } : { w: 0, h: 0, price: 0 } };
  } else {
    // 1 to 8 sizes, some with stock limits.
    const sizes = [];
    for (let i = 0, n = ri(1, 8); i < n; i++) {
      const w = ri(9, 30) * 100, h = ri(6, 15) * 100;
      sizes.push({ w, h, price: priced ? Math.round(w * h / 30000) : 0, max: rnd() < 0.35 ? ri(1, 4) : null });
    }
    sizeSpec = { sizes };
  }
  const lib = material(Object.assign({
    cuttingMethod: rnd() < 0.4 ? 'guillotine' : 'free',
    allowRotation: rnd() < 0.7
  }, sizeSpec));
  delete lib.size1; delete lib.size2;
  if (!lib.sizes) { lib.size1 = sizeSpec.size1; lib.size2 = sizeSpec.size2; }
  if (rnd() < 0.3) lib.trim = [3, 5, 10, 25][ri(0, 3)];
  const small = rnd() < 0.15;
  const pieces = [];
  for (let i = 0, n = ri(1, 15); i < n; i++) {
    pieces.push({
      w: small ? ri(20, 120) : ri(40, 1100) + (rnd() < 0.2 ? 0.5 : 0),
      h: small ? ri(20, 120) : ri(40, 850),
      qty: ri(1, small ? 20 : 5), label: 'P' + i,
      grain: rnd() < 0.2 ? (rnd() < 0.5 ? 'lock' : 'free') : undefined
    });
  }
  run(`job ${t} (${lib.cuttingMethod}, kerf ${kerf}, rotation ${lib.allowRotation})`, lib, pieces, kerf);
}

// ── Linear cutting (bars, tube, extrusion) ────────────────────────
// Every part placed once, in a single row along its bar, the kerf between
// neighbours, inside the end trims, stock limits respected, the offcut and
// percentages consistent, and never more bars than a plain first-fit-
// decreasing would use, nor fewer than the 1D lower bound allows.
console.log('Linear jobs');
function ffdBars(pieces, L, k, mult) {
  const items = [];
  pieces.forEach(p => { for (let i = 0; i < p.qty * mult; i++) items.push(p.w); });
  items.sort((a, b) => b - a);
  const used = [];
  for (const it of items) {
    let i = used.findIndex(u => u + k + it <= L + 1e-9);
    if (i < 0) { used.push(it); } else used[i] += k + it;
  }
  return used.length;
}
function checkLinear(name, lib, pieces, res, kerf, mult) {
  const t = lib.trim || 0;
  const need = pieces.reduce((s, p) => s + p.qty * mult, 0);
  const got = res.sheets.reduce((s, sh) => s + sh.placed.length, 0) + res.unplaced.length;
  ok(got === need, name, `${got} parts accounted for, expected ${need}`);
  ok(res.linear === true && res.kerf === kerf && res.trim === t, name, 'result not marked linear with its kerf and trim');
  const seen = new Set();
  const lengths = E.stockSizes(lib).map(z => z.w);
  const byLen = {};
  for (const sh of res.sheets) {
    ok(lengths.includes(sh.sheetW), name, `bar ${sh.sheetW} is not a stock length`);
    byLen[sh.sheetW] = (byLen[sh.sheetW] || 0) + 1;
    let end = t;
    sh.placed.forEach((p, i) => {
      const key = p.pieceIndex + ':' + p.instanceIndex;
      ok(!seen.has(key), name, 'part placed twice');
      seen.add(key);
      ok(p.y === 0 && p.h === 1, name, 'part not in the single row');
      ok(Math.abs(p.w - pieces[p.pieceIndex].w) < 1e-9, name, 'part length changed');
      ok(p.x >= end + (i ? kerf : 0) - 1e-6, name, `parts closer than the ${kerf} kerf`);
      end = p.x + p.w;
    });
    ok(end <= sh.sheetW - t + 1e-6, name, 'part runs into the end trim');
    const off = sh.offcut ? sh.offcut.w : 0;
    ok(Math.abs(sh.sheetW - t - end - (off ? kerf : 0) - off) < 1e-6 || (off === 0 && sh.sheetW - t - end <= kerf + 1e-6),
       name, 'offcut length does not add up');
    ok(sh.utilPercent + sh.usablePercent + sh.scrapPercent === 100 || sh.scrapPercent === 0, name, 'percentages do not add up');
  }
  for (const z of E.stockSizes(lib)) if (z.max != null) ok((byLen[z.w] || 0) <= z.max, name, `used more ${z.w} bars than the ${z.max} in stock`);
  const sizes = E.stockSizes(lib);
  if (!res.unplaced.length && sizes.length === 1) {
    const L = sizes[0].w - 2 * t;
    const lb = Math.ceil(pieces.reduce((s, p) => s + (p.w + kerf) * p.qty * mult, 0) / (L + kerf) - 1e-9);
    ok(res.sheets.length >= lb, name, `${res.sheets.length} bars is below the lower bound ${lb}`);
    const f = ffdBars(pieces, L, kerf, mult);
    ok(res.sheets.length <= f, name, `${res.sheets.length} bars, first-fit-decreasing needs only ${f}`);
  }
}
{
  // Hand-worked: 7 rails and 3 posts from 6m and 3m flat, 10mm end trim, 2mm kerf.
  const lib = { id: 'lin-1', name: 'Flat 50x6', kind: 'linear', trim: 10, kerf: 2,
                sizes: [{ w: 6000, h: 1, price: 20 }, { w: 3000, h: 1, price: 11 }] };
  const pieces = [{ w: 1000, h: 1, qty: 7, label: 'Rail' }, { w: 450, h: 1, qty: 3, label: 'Post' }];
  ctx.setKerf(4);
  const res = E.packJob(lib, pieces, null, 1);
  checkLinear('rails and posts', lib, pieces, res, 2, 1);
  ok(JSON.stringify(res.sizeMap) === JSON.stringify({ '6000×1': 1, '3000×1': 1 }), 'rails and posts', 'expected one 6m and one 3m bar (£31), got ' + JSON.stringify(res.sizeMap));
  const long = res.sheets.find(s => s.sheetW === 6000);
  ok(long.placed[0].x === 10 && long.offcut.w === 66 && !long.usableOffcut, 'rails and posts', 'first cut after the trim, 66mm offcut kept as scrap');
  const short = res.sheets.find(s => s.sheetW === 3000);
  ok(short.offcut.w === 524 && !!short.usableOffcut, 'rails and posts', '524mm offcut on the 3m bar should be kept');
}
{
  // Exact fill: four 1497mm parts and three 4mm kerfs are exactly 6000mm.
  const lib = { id: 'lin-2', name: 'Box', kind: 'linear', sizes: [{ w: 6000, h: 1, price: 0 }] };
  ctx.setKerf(4);
  const res = E.packJob(lib, [{ w: 1497, h: 1, qty: 8, label: 'Leg' }], null, 1);
  checkLinear('exact fill', lib, [{ w: 1497, qty: 8 }], res, 4, 1);
  ok(res.sheets.length === 2 && res.sheets.every(s => !s.offcut), 'exact fill', 'four parts should exactly fill each bar with no offcut');
}
{
  // Stock limit: only 2 of the 6m bars, so the rest must come from 7.5m.
  const lib = { id: 'lin-3', name: 'Angle', kind: 'linear',
                sizes: [{ w: 6000, h: 1, price: 18, max: 2 }, { w: 7500, h: 1, price: 30 }] };
  ctx.setKerf(3);
  const pieces = [{ w: 2900, h: 1, qty: 8, label: 'Brace' }];
  const res = E.packJob(lib, pieces, null, 1);
  checkLinear('stock limit', lib, pieces, res, 3, 1);
  ok((res.sizeMap['6000×1'] || 0) === 2 && res.sizeMap['7500×1'] === 2, 'stock limit', 'expected 2×6m and 2×7.5m, got ' + JSON.stringify(res.sizeMap));
}
for (let t = 0; t < 40; t++) {
  const kerf = [0, 1.5, 3, 4.8][ri(0, 3)];
  const sizes = [];
  for (let i = 0, n = ri(1, 3); i < n; i++) sizes.push({ w: [3000, 4800, 6000, 6500, 7500][ri(0, 4)] + (i ? i : 0), h: 1, price: rnd() < 0.5 ? ri(10, 60) : 0, max: rnd() < 0.2 ? ri(2, 6) : null });
  const lib = { id: 'lin-r' + t, name: 'Bar', kind: 'linear', sizes, trim: rnd() < 0.3 ? [5, 10, 25][ri(0, 2)] : 0, kerf: rnd() < 0.3 ? 2 : undefined };
  const pieces = [];
  for (let i = 0, n = ri(1, 9); i < n; i++) pieces.push({ w: ri(80, 2800) + (rnd() < 0.2 ? 0.5 : 0), h: 1, qty: ri(1, 9), label: 'L' + i });
  const mult = rnd() < 0.2 ? 3 : 1;
  ctx.setKerf(kerf);
  const res = E.packJob(lib, pieces, null, mult);
  checkLinear(`linear job ${t} (kerf ${lib.kerf != null ? lib.kerf : kerf})`, lib, pieces, res, lib.kerf != null ? lib.kerf : kerf, mult);
}

// ── Speed ─────────────────────────────────────────────────────────
// Before the fix, the offcut search alone took 244s on a sheet of 366 small
// parts, and the whole job never finished. The budget is generous so slow CI
// machines do not flake; a regression to the old behaviour blows it by miles.
console.log('Speed');
{
  seed = 7;
  const pieces = [];
  for (let i = 0; i < 20; i++) pieces.push({ w: ri(20, 120), h: ri(20, 120), qty: ri(10, 30), label: 'P' + i });
  for (const cm of ['guillotine', 'free']) {
    const lib = material({ cuttingMethod: cm, size2: { w: 1950, h: 900, price: 60 } });
    const t0 = Date.now();
    run('366 small parts, ' + cm, lib, pieces, 4);
    const ms = Date.now() - t0;
    console.log(`  366 small parts, ${cm}: ${ms}ms`);
    ok(ms < 30000, 'speed ' + cm, `took ${ms}ms (budget 30000ms)`);
  }
}

{
  // Twelve sheet sizes (the maximum) on a 200-part job.
  seed = 11;
  const sizes = [];
  for (let i = 0; i < 12; i++) sizes.push({ w: 1200 + i * 150, h: 800 + (i % 4) * 150, price: 40 + i * 9 });
  const pieces = [];
  for (let i = 0; i < 25; i++) pieces.push({ w: ri(80, 700), h: ri(60, 500), qty: ri(4, 12), label: 'P' + i });
  const lib = material({ sizes });
  const t0 = Date.now();
  run('12 sizes', lib, pieces, 4);
  const ms = Date.now() - t0;
  console.log(`  ${pieces.reduce((a, p) => a + p.qty, 0)} parts on 12 sheet sizes: ${ms}ms`);
  ok(ms < 30000, 'speed 12 sizes', `took ${ms}ms (budget 30000ms)`);
}

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
