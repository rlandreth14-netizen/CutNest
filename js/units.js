// ════════════════════════════════════════════════════════════════
//  UNITS AND CURRENCY — display only
//  Everything is stored and calculated in millimetres, whatever the user
//  works in. These helpers convert at the edges: what the user types is
//  parsed into mm, and every length shown is formatted from mm. The engine
//  never sees inches. Reads the global `settings` (units, currency).
// ════════════════════════════════════════════════════════════════

const MM_PER_IN = 25.4;

function isInch() {
  return typeof settings !== 'undefined' && !!settings && settings.units === 'in';
}
function unitLabel() { return isInch() ? 'in' : 'mm'; }

// Inches the way a shop reads them: a fraction when the value is exactly a
// 64th (3/32" kerf), or within 0.002" of a sixteenth ("23 5/8"); otherwise up
// to three decimals ("24.13").
function fmtInches(inches) {
  if (!isFinite(inches)) return '';
  const neg = inches < 0;
  const v = Math.abs(inches);
  const frac = function(units, den) {
    const whole = Math.floor(units / den);
    let num = units % den, d = den;
    while (num && num % 2 === 0) { num /= 2; d /= 2; }
    return num ? (whole ? whole + ' ' : '') + num + '/' + d : String(whole);
  };
  const s64 = Math.round(v * 64), s16 = Math.round(v * 16);
  let out;
  if (Math.abs(v - s64 / 64) < 1e-6) out = frac(s64, 64);
  else if (Math.abs(v - s16 / 16) < 0.002) out = frac(s16, 16);
  else out = String(Math.round(v * 1000) / 1000);
  return (neg ? '-' : '') + out;
}

// A length as a bare number in the user's units: "600.5" or "23 5/8".
function lenNum(mm) {
  mm = +mm;
  if (!isFinite(mm)) return '';
  return isInch() ? fmtInches(mm / MM_PER_IN) : String(Math.round(mm * 10) / 10);
}
// With the unit: "600mm" or "23 5/8\"".
function len(mm) { return lenNum(mm) + (isInch() ? '"' : 'mm'); }
// Width x height: "600×400mm" or "23 5/8 × 15 3/4\"".
function dims(w, h) {
  return isInch() ? lenNum(w) + ' × ' + lenNum(h) + '"' : lenNum(w) + '×' + lenNum(h) + 'mm';
}
// The engine keys sheet sizes as "W×H" in mm.
function dimKey(key) {
  const p = String(key).split('×').map(Number);
  return dims(p[0], p[1]);
}
// A plain number for spreadsheets (CSV): decimals, never fractions.
function lenCsv(mm) {
  mm = +mm;
  return isInch() ? Math.round(mm / MM_PER_IN * 1000) / 1000 : Math.round(mm * 10) / 10;
}
// The value to put in an input box ('' for nothing).
function lenInput(mm) {
  return (mm === '' || mm == null || !(+mm > 0)) ? '' : lenNum(mm);
}
function areaTxt(mm2) {
  return isInch() ? (mm2 / 92903.04).toFixed(2) + ' ft²' : (mm2 / 1e6).toFixed(2) + ' m²';
}

// Parse what the user typed into millimetres. Accepts, in either mode:
//   600   600.5   23.625   23 5/8   23-5/8   5/8   8' 6   8ft 6 1/2
// and an explicit unit overrides the setting: 600mm, 60cm, 24", 24in.
// Returns NaN for anything it cannot read.
function parseLen(v) {
  if (typeof v === 'number') return isFinite(v) ? (isInch() ? v * MM_PER_IN : v) : NaN;
  let s = String(v == null ? '' : v).trim().toLowerCase().replace(/″/g, '"').replace(/′/g, "'");
  if (!s) return NaN;
  let unit = null;
  let m;
  if ((m = s.match(/^(.*?)\s*(mm|millimet(?:er|re)s?)$/))) { unit = 'mm'; s = m[1]; }
  else if ((m = s.match(/^(.*?)\s*(cm|centimet(?:er|re)s?)$/))) { unit = 'cm'; s = m[1]; }
  else if ((m = s.match(/^(.*?)\s*("|''|inches|inch|in)$/))) { unit = 'in'; s = m[1]; }
  let feet = 0;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*-?\s*(.*)$/))) {
    feet = parseFloat(m[1]); s = m[2].trim(); unit = 'in';
  }
  let n = 0;
  if (s) {
    if ((m = s.match(/^(?:(\d+(?:\.\d+)?)[\s-]+)?(\d+)\s*\/\s*(\d+)$/)) && +m[3] > 0) {
      n = (m[1] ? parseFloat(m[1]) : 0) + (+m[2]) / (+m[3]);
    } else if (/^\d*\.?\d+$/.test(s)) {
      n = parseFloat(s);
    } else {
      return NaN;
    }
  }
  n += feet * 12;
  const u = unit || (isInch() ? 'in' : 'mm');
  return u === 'in' ? n * MM_PER_IN : u === 'cm' ? n * 10 : n;
}

// ── CURRENCY ──
const CURRENCIES = ['£', '$', '€'];
function currency() {
  const c = typeof settings !== 'undefined' && settings && settings.currency;
  return CURRENCIES.indexOf(c) !== -1 ? c : '£';
}
function money(n, dp) {
  return currency() + (+n || 0).toFixed(dp == null ? 2 : dp);
}
