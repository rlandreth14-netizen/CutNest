// Quote builder tests. Run with: npm test
// js/quote.js turns a calculated job into money: material with markup, cutting
// time from the layouts, handling, setup, extras and tax. These check the
// arithmetic by hand-worked examples, so a change to any rate or rounding rule
// shows up here before it shows up on a customer's quote.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const ctx = { settings: { units: 'mm', currency: '£' }, console };
vm.createContext(ctx);
vm.runInContext(read('engine.js') + '\n' + read('units.js') + '\n' + read('quote.js') +
  '\nthis.Q = { quoteCutting, quoteFigures, cutRates, cleanQuoteSettings, speedShow, speedParse, quoteLen, quoteMins, QUOTE_DEFAULTS };', ctx);
const Q = ctx.Q;

let checks = 0, failures = 0;
function eq(actual, expected, what) {
  checks++;
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) < 1e-9 : actual === expected;
  if (!ok) { failures++; console.error(`  FAIL ${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

const steel = { id: 1, name: 'Steel 2mm', cuttingMethod: 'free', sizes: [{ w: 2000, h: 1000, price: 100 }] };
const freeResult = {
  libMat: steel,
  sheets: [{ sheetW: 2000, sheetH: 1000, placed: [{ x: 0, y: 0, w: 800, h: 600 }, { x: 804, y: 0, w: 500, h: 500 }] }],
  sizeMap: { '2000×1000': 1 }
};
const rates = Object.assign({}, Q.QUOTE_DEFAULTS, {
  machineRate: 60, labourRate: 30, sheetMin: 5, partSec: 15, setup: 10, markup: 20, charge: 'sheets', taxRate: 20
});

// ── Cut length and cuts ──
{
  const c = Q.quoteCutting(freeResult, 4);
  eq(c.length, 4800, 'free placement: both part outlines');
  eq(c.cuts, 2, 'free placement: one pierce per part');
  eq(c.parts, 2, 'parts counted');
  eq(c.sheets, 1, 'sheets counted');
}
{
  const saw = { libMat: { name: 'MDF', cuttingMethod: 'guillotine', sizes: [] },
    sheets: [{ sheetW: 2440, sheetH: 1220, placed: [{ x: 0, y: 0, w: 800, h: 600 }] }], sizeMap: {} };
  const c = Q.quoteCutting(saw, 4);
  eq(c.cuts, 2, 'saw: one part needs two cuts to free it');
  eq(c.length, 1220 + 800, 'saw: full rip then a crosscut across the strip');
  saw.sheets[0].trim = 10;
  saw.sheets[0].placed[0].x = 10; saw.sheets[0].placed[0].y = 10;
  const t = Q.quoteCutting(saw, 4);
  eq(t.cuts, 6, 'saw with edge trim: four trim cuts first');
  eq(t.length, 1200 + 800 + 2 * (2440 + 1220), 'saw with edge trim: trim cuts plus the part cuts on the trimmed sheet');
}

{
  // Bars: one cut per part that does not end at the bar end, plus one to square
  // a trimmed end. Timed per cut, not by length.
  const bar = { linear: true, libMat: { name: 'SHS', kind: 'linear', sizes: [{ w: 6000, h: 1, price: 30 }] },
    sizeMap: { '6000×1': 2 },
    sheets: [{ sheetW: 6000, sheetH: 1, trim: 10, placed: [{ x: 10, y: 0, w: 2000, h: 1 }, { x: 2014, y: 0, w: 2000, h: 1 }] },
             { sheetW: 6000, sheetH: 1, trim: 0, placed: [{ x: 0, y: 0, w: 2998, h: 1 }, { x: 3002, y: 0, w: 2998, h: 1 }] }] };
  const c = Q.quoteCutting(bar, 4);
  eq(c.cuts, 3 + 1, 'bars: squaring cut + 2 part cuts, then 1 cut on the exactly-filled bar');
  eq(c.length, 0, 'bars: no cut length');
  const f = Q.quoteFigures([bar], rates, { kerf: 4 });
  eq(f.mats[0].machineMin, 4 * 45 / 60, 'bars: 45 seconds a cut by default');
  eq(f.mats[0].method, 'linear', 'bars flagged for the quote wording');
  eq(f.materialPrice, 72, 'two 6m bars at 30 with 20% markup');
}

// ── Money, whole sheets ──
{
  const f = Q.quoteFigures([freeResult], rates, { kerf: 4, jobQty: 2, extras: [{ d: 'Delivery', a: 25 }, { d: '', a: '' }] });
  eq(f.mats[0].machineMin, 1.3, 'machine time: 4.8m at 4 m/min plus 2 pierces at 3s');
  eq(f.cutting, 1.3, 'cutting at 60/hour');
  eq(f.mats[0].handleMin, 5.5, 'handling time: 5 min per sheet plus 15s per part');
  eq(f.handling, 2.75, 'handling at 30/hour');
  eq(f.materialCost, 100, 'material cost to the shop');
  eq(f.mats[0].sizes[0].unitPrice, 120, 'sheet price with 20% markup');
  eq(f.materialPrice, 120, 'material price');
  eq(f.extras.length, 1, 'blank extra lines dropped');
  eq(f.subtotal, 159.05, 'subtotal');
  eq(f.tax, 31.81, 'tax at 20%');
  eq(f.total, 190.86, 'total');
  eq(f.perUnit, 95.43, 'price per unit for 2 units');
  eq(f.missingPrice, false, 'all sheets priced');
}
{
  const f = Q.quoteFigures([freeResult], Object.assign({}, rates, { taxRate: 0, setup: 0 }), { kerf: 4 });
  eq(f.tax, 0, 'no tax line at 0%');
  eq(f.total, f.subtotal, 'total equals subtotal without tax');
}

// ── Money, area used ──
{
  const f = Q.quoteFigures([freeResult], Object.assign({}, rates, { charge: 'used' }), { kerf: 4 });
  eq(f.materialCost, 36.5, 'area used: 0.73 m² at 50/m²');
  eq(f.materialPrice, 43.8, 'area used, with markup');
  const withRemnant = Object.assign({}, freeResult, {
    sheets: freeResult.sheets.concat([{ sheetW: 900, sheetH: 700, isRemnant: true, placed: [{ x: 0, y: 0, w: 500, h: 500 }] }])
  });
  const g = Q.quoteFigures([withRemnant], Object.assign({}, rates, { charge: 'used' }), { kerf: 4 });
  eq(g.materialCost, 36.5 + 12.5, 'parts cut from a remnant are charged at the material rate');
}

// ── Missing prices, own cutting rates ──
{
  const unpriced = Object.assign({}, freeResult, { libMat: Object.assign({}, steel, { sizes: [{ w: 2000, h: 1000, price: 0 }] }) });
  eq(Q.quoteFigures([unpriced], rates, {}).missingPrice, true, 'unpriced sheet flagged');
  const own = Object.assign({}, freeResult, { libMat: Object.assign({}, steel, { cutSpeed: 10000, cutSec: 0 }) });
  eq(Q.quoteFigures([own], rates, {}).mats[0].machineMin, 0.48, 'material\'s own speed and zero pierce time used');
  eq(Q.cutRates({ cuttingMethod: 'guillotine' }).speed, 20000, 'saw default speed');
  eq(Q.cutRates({ cuttingMethod: 'free', cutSec: 0 }).sec, 0, 'zero seconds per cut is kept, not defaulted');
}

// ── Display and parsing ──
eq(Q.quoteLen(18100), '18.1 m', 'cut length in metres');
eq(Q.quoteMins(85), '1 h 25 min', 'hours and minutes');
eq(Q.quoteMins(4.6), '5 min', 'minutes rounded');
eq(Q.speedParse('4'), 4000, 'm/min to mm/min');
ctx.settings.units = 'in';
eq(Q.quoteLen(304.8 * 10), '10.0 ft', 'cut length in feet');
eq(Q.speedParse('100'), 2540, 'in/min to mm/min');
eq(Q.speedShow(2540), '100', 'mm/min shown as in/min');
ctx.settings.units = 'mm';

// ── Settings from a backup file ──
{
  const good = 'data:image/png;base64,iVBORw0KGgo=';
  const c = Q.cleanQuoteSettings({ machineRate: '75', labourRate: -5, markup: 'x', charge: 'used', layout: 'bogus',
    logo: good, business: { address: 'A', phone: 5, evil: 'x' }, taxLabel: 'GST', extra: 1 });
  eq(c.machineRate, 75, 'numeric string kept as a number');
  eq(c.labourRate, undefined, 'negative rate dropped');
  eq(c.markup, undefined, 'non-numeric rate dropped');
  eq(c.charge, 'used', 'valid option kept');
  eq(c.layout, undefined, 'unknown option dropped');
  eq(c.logo, good, 'image data URL kept');
  eq(c.business.address, 'A', 'business field kept');
  eq(c.business.phone, '', 'non-string business field blanked');
  eq(c.business.evil, undefined, 'unknown business field dropped');
  eq(c.extra, undefined, 'unknown setting dropped');
  eq(Q.cleanQuoteSettings({ logo: 'javascript:alert(1)' }).logo, undefined, 'script URL rejected as a logo');
  eq(Q.cleanQuoteSettings({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' }).logo, undefined, 'only the PNG/JPEG the app makes is accepted');
}

console.log(`quote: ${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
