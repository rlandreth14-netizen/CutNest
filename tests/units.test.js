// Unit conversion tests. Run with: npm test
// js/units.js turns what people type into millimetres and formats millimetres
// for display. Everything in CutNest is stored in mm, so these two functions
// are the whole of imperial support: if they are right, inches are right.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { settings: { units: 'mm' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'units.js'), 'utf8') +
  '\nthis.U = { parseLen, fmtInches, len, dims, lenNum, lenCsv, money, dimKey };', ctx);
const U = ctx.U;
let checks = 0, failures = 0;
function eq(actual, expected, what) {
  checks++;
  const ok = typeof expected === 'number'
    ? (Number.isNaN(expected) ? Number.isNaN(actual) : Math.abs(actual - expected) < 1e-9)
    : actual === expected;
  if (!ok) { failures++; console.error(`  FAIL ${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

// Millimetre mode
ctx.settings.units = 'mm';
eq(U.parseLen('600'), 600, 'mm: plain');
eq(U.parseLen('600.5'), 600.5, 'mm: decimal');
eq(U.parseLen('24"'), 609.6, 'mm mode: explicit inches win');
eq(U.parseLen('60cm'), 600, 'mm mode: cm');
eq(U.parseLen(''), NaN, 'mm: empty');
eq(U.parseLen('abc'), NaN, 'mm: junk');
eq(U.len(600.25), '600.3mm', 'mm: one decimal');
eq(U.dims(2440, 1220), '2440×1220mm', 'mm: dims');
eq(U.dimKey('2440×1220'), '2440×1220mm', 'mm: engine size key');

// Inch mode
ctx.settings.units = 'in';
eq(U.parseLen('23 5/8'), 23.625 * 25.4, 'in: mixed fraction');
eq(U.parseLen('23-5/8'), 23.625 * 25.4, 'in: dashed fraction');
eq(U.parseLen('5/8'), 0.625 * 25.4, 'in: bare fraction');
eq(U.parseLen('23.625"'), 23.625 * 25.4, 'in: decimal with quote');
eq(U.parseLen("8' 6"), 102 * 25.4, 'in: feet and inches');
eq(U.parseLen('8ft 6 1/2'), 102.5 * 25.4, 'in: ft and fraction');
eq(U.parseLen('600mm'), 600, 'in mode: explicit mm wins');
eq(U.parseLen('1/0'), NaN, 'in: divide by zero');
eq(U.fmtInches(23.625), '23 5/8', 'in: format fraction');
eq(U.fmtInches(0.125), '1/8', 'in: format bare fraction');
eq(U.fmtInches(96), '96', 'in: format whole');
eq(U.fmtInches(3 / 32), '3/32', 'in: exact 32nd');
eq(U.fmtInches(5 / 64), '5/64', 'in: exact 64th');
eq(U.fmtInches(24.13), '24.13', 'in: off-sixteenth stays decimal');
eq(U.fmtInches(24.127), '24 1/8', 'in: within 0.002" of a sixteenth shows the fraction');
eq(U.len(3.175), '1/8"', 'in: 1/8" kerf');
eq(U.len(2438.4), '96"', 'in: 96"');
eq(U.dims(2438.4, 1219.2), '96 × 48"', 'in: dims');
eq(U.lenCsv(600.075), 23.625, 'in: CSV stays decimal');
// Round trip: every 64th from 0 to 120" formats and parses back exactly.
for (let s = 1; s <= 120 * 64; s++) {
  const mm = s / 64 * 25.4;
  const back = U.parseLen(U.lenNum(mm));
  if (Math.abs(back - mm) > 1e-9) { eq(back, mm, `round trip ${s}/64"`); break; }
}
checks++;

// Currency
ctx.settings.currency = '$';
eq(U.money(12), '$12.00', 'money $');
ctx.settings.currency = 'nonsense';
eq(U.money(12, 0), '£12', 'money falls back to £');

console.log(`units: ${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
