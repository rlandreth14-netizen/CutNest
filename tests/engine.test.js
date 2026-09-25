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
      ok(p.x >= -EPS && p.y >= -EPS && p.x + p.w <= s.sheetW + EPS && p.y + p.h <= s.sheetH + EPS,
         name, `piece outside ${s.sheetW}x${s.sheetH} sheet at ${p.x},${p.y}`);
      const o = pieces[p.pieceIndex];
      const same = p.w === o.w && p.h === o.h, swapped = p.w === o.h && p.h === o.w;
      ok(same || swapped, name, 'piece dimensions changed');
      if (lib.allowRotation === false) ok(same, name, 'piece rotated although grain is locked');
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
    if (lib.cuttingMethod === 'guillotine' && s.placed.length > 1) {
      ok(!!E.deriveGuillotineCuts(s.placed, s.sheetW, s.sheetH, kerf), name, 'guillotine sheet has no valid cut sequence');
    }
  }
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
  const res = E.runMat(lib, pieces, null, 1);
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
  const small = rnd() < 0.15;
  const pieces = [];
  for (let i = 0, n = ri(1, 15); i < n; i++) {
    pieces.push({
      w: small ? ri(20, 120) : ri(40, 1100) + (rnd() < 0.2 ? 0.5 : 0),
      h: small ? ri(20, 120) : ri(40, 850),
      qty: ri(1, small ? 20 : 5), label: 'P' + i
    });
  }
  run(`job ${t} (${lib.cuttingMethod}, kerf ${kerf}, rotation ${lib.allowRotation})`, lib, pieces, kerf);
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
