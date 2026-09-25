// ════════════════════════════════════════════════════════════════
//  QUOTES (Pro) — turn a calculated job into a priced customer quote
//
//  The job already knows what the customer's parts cost in material. This
//  adds what they cost to cut and handle: cut length and number of cuts come
//  from the layouts themselves (the real saw sequence for guillotine work, the
//  part outlines and one pierce per part for CNC), turned into machine and
//  labour time at the shop's own rates, plus markup, setup, extra lines and
//  tax. The result prints as a branded quote the shop can send as it is.
//
//  Everything is stored in mm and minutes; only display converts. The maths
//  (quoteCutting, quoteFigures) is pure so it is tested without a browser.
// ════════════════════════════════════════════════════════════════

// Shop-wide defaults, saved in settings.quote.
const QUOTE_DEFAULTS = {
  machineRate: 60,      // per hour of machine time
  labourRate: 30,       // per hour of handling time
  sheetMin: 5,          // minutes to load and unload each sheet
  partSec: 15,          // seconds to unload, deburr and stack each part
  setup: 0,             // fixed charge per job
  markup: 20,           // % on material
  charge: 'sheets',     // 'sheets': whole sheets bought; 'used': area used only
  taxLabel: 'VAT',
  taxRate: 20,
  validDays: 30,
  prefix: 'Q-',
  nextNo: 1,
  layout: 'itemised',   // 'itemised' | 'summary'
  partsList: true,
  business: { address: '', phone: '', email: '', web: '', taxNo: '' },
  logo: '',
  terms: 'Prices are for the parts listed, cut to the sizes shown. Delivery is not included unless it is listed above.'
};

// Cutting speed (mm per minute) and time per cut or pierce (seconds) when a
// material has not been given its own. Deliberately middle-of-the-road: a
// laser on thin steel or a router in MDF for free placement, a panel saw with
// positioning time for guillotine. Every shop should set its own.
const CUT_DEFAULTS = {
  free: { speed: 4000, sec: 3 },
  guillotine: { speed: 20000, sec: 30 }
};

function quoteSettings() {
  const q = Object.assign({}, QUOTE_DEFAULTS, (typeof settings !== 'undefined' && settings && settings.quote) || {});
  q.business = Object.assign({}, QUOTE_DEFAULTS.business, q.business || {});
  return q;
}

// Quote settings from somewhere untrusted (a backup file): known fields only,
// numbers as numbers, and a logo only if it is an image the app itself made.
function cleanQuoteSettings(raw) {
  const out = {}, d = QUOTE_DEFAULTS;
  ['machineRate', 'labourRate', 'sheetMin', 'partSec', 'setup', 'markup', 'taxRate', 'validDays', 'nextNo'].forEach(function (k) {
    const n = +raw[k]; if (isFinite(n) && n >= 0) out[k] = Math.min(1e7, n);
  });
  if (raw.charge === 'used' || raw.charge === 'sheets') out.charge = raw.charge;
  if (raw.layout === 'summary' || raw.layout === 'itemised') out.layout = raw.layout;
  if (typeof raw.partsList === 'boolean') out.partsList = raw.partsList;
  ['taxLabel', 'prefix'].forEach(function (k) { if (typeof raw[k] === 'string') out[k] = raw[k].slice(0, 20); });
  if (typeof raw.terms === 'string') out.terms = raw.terms.slice(0, 1200);
  if (typeof raw.logo === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(raw.logo) && raw.logo.length < 600000) out.logo = raw.logo;
  const b = raw.business && typeof raw.business === 'object' ? raw.business : {};
  out.business = {};
  Object.keys(d.business).forEach(function (k) { out.business[k] = typeof b[k] === 'string' ? b[k].slice(0, k === 'address' ? 300 : 120) : ''; });
  return out;
}

function cutRates(libMat) {
  const d = CUT_DEFAULTS[libMat && libMat.cuttingMethod === 'guillotine' ? 'guillotine' : 'free'];
  const speed = +(libMat && libMat.cutSpeed) > 0 ? +libMat.cutSpeed : d.speed;
  const sec = libMat && libMat.cutSec != null && libMat.cutSec !== '' && +libMat.cutSec >= 0 ? +libMat.cutSec : d.sec;
  return { speed: speed, sec: sec, own: +(libMat && libMat.cutSpeed) > 0 };
}

// Cut length (mm), number of cuts or pierces, parts and sheets for one
// material's result. Guillotine: the actual cut sequence, plus the four trim
// cuts when the sheet has an edge trim. Free placement: every part's outline
// and one pierce per part (shared edges are counted twice, which is how most
// shops estimate, and errs on the safe side).
function quoteCutting(r, kerf) {
  const lib = r.libMat || {};
  const saw = lib.cuttingMethod === 'guillotine';
  let length = 0, cuts = 0, parts = 0;
  (r.sheets || []).forEach(function (sh) {
    parts += sh.placed.length;
    if (saw) {
      const t = sh.trim || 0;
      const inner = sh.placed.map(function (p) { return Object.assign({}, p, { x: p.x - t, y: p.y - t }); });
      const seq = deriveGuillotineCuts(inner, sh.sheetW - 2 * t, sh.sheetH - 2 * t, kerf);
      if (seq) {
        seq.forEach(function (c) { length += c.to - c.from; cuts++; });
        if (t > 0) { length += 2 * (sh.sheetW + sh.sheetH); cuts += 4; }
        return;
      }
    }
    sh.placed.forEach(function (p) { length += 2 * (p.w + p.h); cuts++; });
  });
  return { length: length, cuts: cuts, parts: parts, sheets: (r.sheets || []).length };
}

const _r2 = function (n) { return Math.round((+n || 0) * 100) / 100; };

// Every number on the quote. `results` is calcResult.results; `opt` carries
// kerf, jobQty and the job's extra lines [{d, a}].
function quoteFigures(results, q, opt) {
  opt = opt || {};
  const kerf = opt.kerf != null ? opt.kerf : 0;
  const markup = 1 + (Math.max(0, +q.markup || 0) / 100);
  let missingPrice = false;
  const mats = (results || []).map(function (r) {
    const lib = r.libMat || {};
    const rates = cutRates(lib);
    const c = quoteCutting(r, kerf);
    const machineMin = c.length / rates.speed + c.cuts * rates.sec / 60;
    const handleMin = c.sheets * (+q.sheetMin || 0) + c.parts * (+q.partSec || 0) / 60;
    const sizes = [];
    let cost = 0, usedArea = 0;
    if (q.charge === 'used') {
      // Area of the parts, at the price per area of the sheet each came off.
      // Parts on a remnant are charged at the material's cheapest priced rate.
      const priced = (lib.sizes || []).filter(function (z) { return +z.price > 0 && z.w > 0 && z.h > 0; });
      const cheapest = priced.length ? Math.min.apply(null, priced.map(function (z) { return z.price / (z.w * z.h); })) : 0;
      (r.sheets || []).forEach(function (sh) {
        const a = sh.placed.reduce(function (s, p) { return s + p.w * p.h; }, 0);
        const z = sh.isRemnant ? null : (lib.sizes || []).find(function (s) { return s.w === sh.sheetW && s.h === sh.sheetH; });
        const rate = z && +z.price > 0 ? z.price / (z.w * z.h) : cheapest;
        if (!rate && a > 0) missingPrice = true;
        usedArea += a;
        cost += a * rate;
      });
    } else {
      Object.keys(r.sizeMap || {}).forEach(function (key) {
        const wh = key.split('×').map(Number), n = r.sizeMap[key];
        const z = (lib.sizes || []).find(function (s) { return s.w === wh[0] && s.h === wh[1]; });
        const unit = z && +z.price > 0 ? +z.price : 0;
        if (!unit && n > 0) missingPrice = true;
        sizes.push({ w: wh[0], h: wh[1], count: n, unitCost: unit, unitPrice: _r2(unit * markup), amount: _r2(_r2(unit * markup) * n) });
        cost += unit * n;
      });
    }
    const materialCost = _r2(cost);
    const materialPrice = q.charge === 'used' ? _r2(cost * markup) : _r2(sizes.reduce(function (s, z) { return s + z.amount; }, 0));
    return {
      name: lib.name || '', thickness: lib.thickness || '', method: lib.cuttingMethod === 'guillotine' ? 'guillotine' : 'free',
      id: lib.id, sizes: sizes, usedArea: usedArea, materialCost: materialCost, materialPrice: materialPrice,
      cutLength: c.length, cuts: c.cuts, parts: c.parts, sheets: c.sheets,
      speed: rates.speed, sec: rates.sec, machineMin: machineMin, handleMin: handleMin,
      cutting: _r2(machineMin / 60 * (+q.machineRate || 0)),
      handling: _r2(handleMin / 60 * (+q.labourRate || 0))
    };
  });
  const sum = function (f) { return _r2(mats.reduce(function (s, m) { return s + m[f]; }, 0)); };
  const extras = (opt.extras || []).filter(function (x) { return x && (String(x.d || '').trim() || +x.a); })
    .map(function (x) { return { d: String(x.d || '').trim(), a: _r2(x.a) }; });
  const f = {
    mats: mats,
    materialCost: sum('materialCost'), materialPrice: sum('materialPrice'),
    cutting: sum('cutting'), handling: sum('handling'),
    machineMin: mats.reduce(function (s, m) { return s + m.machineMin; }, 0),
    handleMin: mats.reduce(function (s, m) { return s + m.handleMin; }, 0),
    setup: _r2(Math.max(0, +q.setup || 0)),
    extras: extras,
    jobQty: Math.max(1, +opt.jobQty || 1),
    missingPrice: missingPrice
  };
  f.extrasTotal = _r2(extras.reduce(function (s, x) { return s + x.a; }, 0));
  f.subtotal = _r2(f.materialPrice + f.cutting + f.handling + f.setup + f.extrasTotal);
  f.taxRate = Math.max(0, +q.taxRate || 0);
  f.tax = _r2(f.subtotal * f.taxRate / 100);
  f.total = _r2(f.subtotal + f.tax);
  f.perUnit = _r2(f.total / f.jobQty);
  return f;
}

// ── DISPLAY HELPERS ──
function quoteLen(mm) {
  return isInch() ? (mm / 304.8).toFixed(1) + ' ft' : (mm / 1000).toFixed(1) + ' m';
}
function quoteMins(min) {
  const m = Math.round(min);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}
// Cutting speed shown per minute in m (metric) or inches (imperial, as CNC
// feed rates are quoted), stored in mm/min.
function speedUnit() { return isInch() ? 'in/min' : 'm/min'; }
function speedShow(mmPerMin) { return isInch() ? String(Math.round(mmPerMin / MM_PER_IN)) : String(Math.round(mmPerMin / 100) / 10); }
function speedParse(v) { const n = parseFloat(v); return n > 0 ? (isInch() ? n * MM_PER_IN : n * 1000) : 0; }
function quoteDate(d) {
  return d.toLocaleDateString(currency() === '$' ? 'en-US' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function matTitle(m) {
  return m.name + (m.thickness && m.name.indexOf(m.thickness) === -1 ? ' ' + m.thickness : '');
}

// ── JOB STATE ──
// The customer, quote number and extra lines belong to the job, so they are
// saved with it (saveState) and cleared by New job.
let quoteJob = null;
function blankQuoteJob() { return { no: '', customer: '', contact: '', notes: '', extras: [] }; }
function ensureQuoteJob() {
  if (!quoteJob || typeof quoteJob !== 'object') quoteJob = blankQuoteJob();
  if (!Array.isArray(quoteJob.extras)) quoteJob.extras = [];
  return quoteJob;
}
function autoQuoteNo() {
  const q = quoteSettings();
  return (q.prefix || '') + String(Math.max(1, parseInt(q.nextNo, 10) || 1)).padStart(4, '0');
}
function saveQuoteSettings(patch) {
  settings.quote = Object.assign(quoteSettings(), patch || {});
  try { localStorage.setItem(SETT_KEY, JSON.stringify(settings)); }
  catch (e) { showToast('Could not save — your browser storage is full. Try a smaller logo.'); }
}

function currentJobQty() {
  if (calcResult && calcResult.jobQty) return calcResult.jobQty;
  const el = document.getElementById('job-qty');
  return isPro ? Math.max(1, parseInt(el && el.value, 10) || 1) : 1;
}
function currentFigures() {
  const qj = ensureQuoteJob();
  return quoteFigures(calcResult.results, quoteSettings(), { kerf: KERF, jobQty: currentJobQty(), extras: qj.extras });
}

// ── QUOTE WINDOW ──
function openQuote() {
  if (!isPro) {
    showUpgradeModal('\u{1F4B7}', 'Quotes', 'Pro turns this job into a customer quote: material with your markup, cutting time worked out from the actual layouts, handling, setup and extras at your own rates, then a branded quote with your logo, ready to send.');
    return;
  }
  if (!calcResult || !calcResult.results.length) { showToast('Calculate a job first'); return; }
  const qj = ensureQuoteJob();
  if (!qj.no) { qj.no = autoQuoteNo(); saveState(); }
  renderQuoteForm();
  updateQuoteSummary();
  const m = document.getElementById('quote-modal'); if (m) m.style.display = 'flex';
}
function closeQuote() { const m = document.getElementById('quote-modal'); if (m) m.style.display = 'none'; }

function _qin(id, value, attrs) {
  return `<input type="text" id="${id}" value="${esc(value == null ? '' : String(value))}" ${attrs || ''}/>`;
}
function renderQuoteForm() {
  const q = quoteSettings(), qj = ensureQuoteJob(), f = currentFigures(), cur = esc(currency());
  const matRows = f.mats.map(function (m, i) {
    return `<tr>
      <td>${esc(matTitle(m))}<div class="q-sub">${m.method === 'guillotine' ? 'Saw / guillotine' : 'CNC / free placement'} · ${m.parts} part${m.parts !== 1 ? 's' : ''}, ${m.sheets} sheet${m.sheets !== 1 ? 's' : ''}</div></td>
      <td class="num">${esc(quoteLen(m.cutLength))}</td>
      <td class="num">${m.cuts}</td>
      <td><input type="text" inputmode="decimal" class="q-num" id="q-speed-${i}" value="${esc(speedShow(m.speed))}" aria-label="Cutting speed for ${esc(m.name)} in ${speedUnit()}" oninput="setMatCutRate(${i},'speed',this.value)"/></td>
      <td><input type="text" inputmode="decimal" class="q-num" id="q-sec-${i}" value="${esc(String(m.sec))}" aria-label="Seconds per cut for ${esc(m.name)}" oninput="setMatCutRate(${i},'sec',this.value)"/></td>
      <td class="num" id="q-mtime-${i}">${esc(quoteMins(m.machineMin))}</td>
    </tr>`;
  }).join('');
  const b = q.business;
  // Keep the business section as the user left it when the form is redrawn
  // (e.g. after adding a logo); first time, open it until details are filled in.
  const prevBiz = document.querySelector('#quote-form details.q-biz');
  const bizOpen = prevBiz ? prevBiz.open : !(b.address || q.logo);
  document.getElementById('quote-form').innerHTML = `
    <div class="q-sec">
      <div class="q-h">Customer</div>
      <div class="q-row">
        <div><label class="lbl" for="q-no">Quote number</label>${_qin('q-no', qj.no, 'oninput="setQuoteJob(\'no\',this.value)"')}</div>
        <div><label class="lbl" for="q-valid">Valid for (days)</label>${_qin('q-valid', q.validDays, 'inputmode="numeric" oninput="setQuoteNum(\'validDays\',this.value)"')}</div>
      </div>
      <label class="lbl" for="q-customer">Customer name</label>${_qin('q-customer', qj.customer, 'placeholder="e.g. Harper Joinery Ltd" oninput="setQuoteJob(\'customer\',this.value)"')}
      <label class="lbl" for="q-contact" style="margin-top:8px">Address / contact</label>
      <textarea id="q-contact" rows="3" oninput="setQuoteJob('contact',this.value)">${esc(qj.contact)}</textarea>
      <label class="lbl" for="q-notes" style="margin-top:8px">Notes for this quote</label>
      <textarea id="q-notes" rows="2" placeholder="Optional, e.g. collection from our yard, lead time 5 working days" oninput="setQuoteJob('notes',this.value)">${esc(qj.notes)}</textarea>
    </div>

    <div class="q-sec">
      <div class="q-h">Cutting time</div>
      <div class="q-scroll"><table class="q-tbl">
        <thead><tr><th>Material</th><th class="num">Cut length</th><th class="num">Cuts</th><th>Speed (${speedUnit()})</th><th>Secs / cut</th><th class="num">Machine</th></tr></thead>
        <tbody>${matRows}</tbody>
      </table></div>
      <p class="q-hint">Saw jobs use the real cut sequence. CNC jobs count each part's outline and one pierce per part. Speeds are saved to each material in your Library.</p>
    </div>

    <div class="q-sec">
      <div class="q-h">Rates &amp; pricing</div>
      <div class="q-row q-row3">
        <div><label class="lbl" for="q-mrate">Machine ${cur}/hour</label>${_qin('q-mrate', q.machineRate, 'inputmode="decimal" oninput="setQuoteNum(\'machineRate\',this.value)"')}</div>
        <div><label class="lbl" for="q-lrate">Labour ${cur}/hour</label>${_qin('q-lrate', q.labourRate, 'inputmode="decimal" oninput="setQuoteNum(\'labourRate\',this.value)"')}</div>
        <div><label class="lbl" for="q-setup">Setup ${cur} per job</label>${_qin('q-setup', q.setup, 'inputmode="decimal" oninput="setQuoteNum(\'setup\',this.value)"')}</div>
        <div><label class="lbl" for="q-sheetmin">Handling min / sheet</label>${_qin('q-sheetmin', q.sheetMin, 'inputmode="decimal" oninput="setQuoteNum(\'sheetMin\',this.value)"')}</div>
        <div><label class="lbl" for="q-partsec">Handling secs / part</label>${_qin('q-partsec', q.partSec, 'inputmode="decimal" oninput="setQuoteNum(\'partSec\',this.value)"')}</div>
        <div><label class="lbl" for="q-markup">Material markup %</label>${_qin('q-markup', q.markup, 'inputmode="decimal" oninput="setQuoteNum(\'markup\',this.value)"')}</div>
      </div>
      <div class="q-row q-row3">
        <div><label class="lbl" for="q-charge">Charge material by</label>
          <select id="q-charge" onchange="setQuoteOpt('charge',this.value)">
            <option value="sheets"${q.charge !== 'used' ? ' selected' : ''}>Whole sheets</option>
            <option value="used"${q.charge === 'used' ? ' selected' : ''}>Area used only</option>
          </select></div>
        <div><label class="lbl" for="q-taxlabel">Tax name</label>${_qin('q-taxlabel', q.taxLabel, 'oninput="setQuoteOpt(\'taxLabel\',this.value)"')}</div>
        <div><label class="lbl" for="q-taxrate">Tax %</label>${_qin('q-taxrate', q.taxRate, 'inputmode="decimal" oninput="setQuoteNum(\'taxRate\',this.value)"')}</div>
      </div>
    </div>

    <div class="q-sec">
      <div class="q-h">Extra lines</div>
      <div id="q-extras"></div>
      <button type="button" class="btn btn-out q-add" onclick="addQuoteExtra()">+ Add a line</button>
      <p class="q-hint">Delivery, edge banding, finishing, anything else to charge for on this job.</p>
    </div>

    <div class="q-sec">
      <div class="q-h">On the quote</div>
      <div class="q-row">
        <div><label class="lbl" for="q-layout">Show prices</label>
          <select id="q-layout" onchange="setQuoteOpt('layout',this.value)">
            <option value="itemised"${q.layout !== 'summary' ? ' selected' : ''}>Itemised: material, cutting, handling</option>
            <option value="summary"${q.layout === 'summary' ? ' selected' : ''}>One line per material</option>
          </select></div>
        <label class="q-check"><input type="checkbox" id="q-parts" ${q.partsList ? 'checked' : ''} onchange="setQuoteOpt('partsList',this.checked)"/> Include the parts list</label>
      </div>
    </div>

    <details class="q-sec q-biz" ${bizOpen ? 'open' : ''}>
      <summary class="q-h">Your business details</summary>
      <div class="q-logo-row">
        <div class="q-logo" id="q-logo-prev">${q.logo ? `<img src="${esc(q.logo)}" alt="Your logo"/>` : '<span>No logo</span>'}</div>
        <div>
          <label class="btn btn-out q-file">Choose logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="setQuoteLogo(this)"/></label>
          ${q.logo ? '<button type="button" class="btn btn-out" onclick="removeQuoteLogo()">Remove</button>' : ''}
          <div class="q-hint">PNG or JPG. Kept in this browser only.</div>
        </div>
      </div>
      <label class="lbl" for="q-bizname">Business name</label>${_qin('q-bizname', settings.companyName || '', 'oninput="setBizName(this.value)"')}
      <label class="lbl" for="q-addr" style="margin-top:8px">Address</label>
      <textarea id="q-addr" rows="3" oninput="setBiz('address',this.value)">${esc(b.address)}</textarea>
      <div class="q-row">
        <div><label class="lbl" for="q-phone">Phone</label>${_qin('q-phone', b.phone, 'oninput="setBiz(\'phone\',this.value)"')}</div>
        <div><label class="lbl" for="q-email">Email</label>${_qin('q-email', b.email, 'oninput="setBiz(\'email\',this.value)"')}</div>
        <div><label class="lbl" for="q-web">Website</label>${_qin('q-web', b.web, 'oninput="setBiz(\'web\',this.value)"')}</div>
        <div><label class="lbl" for="q-taxno">Tax / VAT number</label>${_qin('q-taxno', b.taxNo, 'oninput="setBiz(\'taxNo\',this.value)"')}</div>
      </div>
      <label class="lbl" for="q-terms" style="margin-top:8px">Terms (printed at the foot of every quote)</label>
      <textarea id="q-terms" rows="3" oninput="setQuoteOpt('terms',this.value)">${esc(q.terms)}</textarea>
    </details>`;
  renderQuoteExtras();
}

function renderQuoteExtras() {
  const qj = ensureQuoteJob(), box = document.getElementById('q-extras');
  if (!box) return;
  box.innerHTML = qj.extras.map(function (x, i) {
    return `<div class="q-extra">
      <input type="text" value="${esc(x.d || '')}" placeholder="Description" aria-label="Extra line ${i + 1} description" oninput="setQuoteExtra(${i},'d',this.value)"/>
      <input type="text" inputmode="decimal" class="q-num" value="${esc(x.a === '' || x.a == null ? '' : String(x.a))}" placeholder="${esc(currency())}0.00" aria-label="Extra line ${i + 1} amount" oninput="setQuoteExtra(${i},'a',this.value)"/>
      <button type="button" class="q-x" onclick="removeQuoteExtra(${i})" aria-label="Remove extra line ${i + 1}">&#10005;</button>
    </div>`;
  }).join('');
}

// ── FORM HANDLERS ──
function setQuoteJob(k, v) { ensureQuoteJob()[k] = String(v).slice(0, k === 'contact' || k === 'notes' ? 600 : 120); saveState(); updateQuoteSummary(); }
function setQuoteNum(k, v) {
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  const patch = {}; patch[k] = isFinite(n) ? Math.max(0, n) : 0;
  saveQuoteSettings(patch); updateQuoteSummary();
}
function setQuoteOpt(k, v) {
  const patch = {}; patch[k] = typeof v === 'string' ? v.slice(0, k === 'terms' ? 1200 : 60) : v;
  saveQuoteSettings(patch); updateQuoteSummary();
}
function setBiz(k, v) {
  const q = quoteSettings(); q.business[k] = String(v).slice(0, k === 'address' ? 300 : 120);
  saveQuoteSettings({ business: q.business });
}
function setBizName(v) {
  settings.companyName = String(v).trim().slice(0, 120);
  try { localStorage.setItem(SETT_KEY, JSON.stringify(settings)); } catch (e) {}
}
function addQuoteExtra() {
  ensureQuoteJob().extras.push({ d: '', a: '' }); saveState(); renderQuoteExtras();
  const rows = document.querySelectorAll('#q-extras .q-extra input'); if (rows.length) rows[rows.length - 2].focus();
}
function removeQuoteExtra(i) { ensureQuoteJob().extras.splice(i, 1); saveState(); renderQuoteExtras(); updateQuoteSummary(); }
function setQuoteExtra(i, k, v) {
  const x = ensureQuoteJob().extras[i]; if (!x) return;
  if (k === 'a') { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); x.a = isFinite(n) ? n : ''; }
  else x.d = String(v).slice(0, 120);
  saveState(); updateQuoteSummary();
}
// A material's own cutting speed and time per cut, saved to the Library entry.
let _cutRateSave = null;
function setMatCutRate(i, k, v) {
  const r = calcResult && calcResult.results[i]; if (!r) return;
  const val = k === 'speed' ? speedParse(v) : (String(v).trim() === '' ? null : Math.max(0, parseFloat(v) || 0));
  const apply = function (m) { if (!m) return; if (k === 'speed') m.cutSpeed = val > 0 ? Math.round(val) : null; else m.cutSec = val; };
  apply(r.libMat);
  const stored = library.find(function (l) { return l.id == r.libMat.id; });
  if (stored && stored !== r.libMat) apply(stored);
  clearTimeout(_cutRateSave);
  _cutRateSave = setTimeout(function () { try { persistLib(library); } catch (e) {} }, 400);
  updateQuoteSummary();
}

// Logo: scaled down in the browser so it stays small in local storage.
function setQuoteLogo(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('That image is over 5MB — choose a smaller logo'); return; }
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, 600 / img.width, 200 / img.height);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * scale)); cv.height = Math.max(1, Math.round(img.height * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let url = cv.toDataURL('image/png');
      if (url.length > 250000) url = cv.toDataURL('image/jpeg', 0.85);
      saveQuoteSettings({ logo: url });
      renderQuoteForm(); updateQuoteSummary();
      showToast('✓ Logo added');
    };
    img.onerror = function () { showToast('That file is not an image CutNest can read'); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function removeQuoteLogo() { saveQuoteSettings({ logo: '' }); renderQuoteForm(); updateQuoteSummary(); }

// ── SUMMARY (right-hand panel) ──
function updateQuoteSummary() {
  const box = document.getElementById('quote-summary');
  if (!box || !calcResult) return;
  const q = quoteSettings(), f = currentFigures();
  f.mats.forEach(function (m, i) { const el = document.getElementById('q-mtime-' + i); if (el) el.textContent = quoteMins(m.machineMin); });
  const row = function (label, amt, cls) { return `<div class="qs-row ${cls || ''}"><span>${label}</span><b>${esc(money(amt))}</b></div>`; };
  const stale = document.getElementById('stale-banner');
  let html = '';
  if (stale && stale.style.display !== 'none' && stale.style.display !== '') html += '<div class="qs-warn">Pieces have changed since this was calculated — recalculate before quoting.</div>';
  if (f.missingPrice) html += '<div class="qs-warn">Some sheets have no price, so material is under-quoted. Add prices in the Library.</div>';
  html += row('Material' + (q.markup ? ' (+' + esc(String(q.markup)) + '%)' : ''), f.materialPrice);
  html += row('Cutting · ' + esc(quoteMins(f.machineMin)), f.cutting);
  html += row('Handling · ' + esc(quoteMins(f.handleMin)), f.handling);
  if (f.setup) html += row('Setup', f.setup);
  f.extras.forEach(function (x) { html += row(esc(x.d || 'Extra'), x.a); });
  html += row('Subtotal', f.subtotal, 'qs-sub');
  if (f.taxRate) html += row(esc(q.taxLabel || 'Tax') + ' ' + f.taxRate + '%', f.tax);
  html += `<div class="qs-total"><span>Total</span><b id="qs-total">${esc(money(f.total))}</b></div>`;
  if (f.jobQty > 1) html += `<div class="qs-unit">${esc(money(f.perUnit))} per unit × ${f.jobQty}</div>`;
  html += `<div class="qs-note">Material costs you ${esc(money(f.materialCost))}${f.materialPrice > f.materialCost ? ', so markup adds ' + esc(money(f.materialPrice - f.materialCost)) : ''}.</div>`;
  box.innerHTML = html;
}

// ── PRINTABLE QUOTE ──
function quotePartsList() {
  // One row per part as entered: name, size (as drawn, not as rotated for the
  // nest) and how many, per material.
  return calcResult.results.map(function (r) {
    const parts = {};
    r.sheets.forEach(function (sh) {
      sh.placed.forEach(function (p) {
        const w = p.rotated ? p.h : p.w, h = p.rotated ? p.w : p.h;
        const k = p.pieceIndex + '|' + w + '|' + h;
        if (!parts[k]) parts[k] = { label: p.label || ('P' + (p.pieceIndex + 1)), w: w, h: h, qty: 0, i: p.pieceIndex };
        parts[k].qty++;
      });
    });
    return { title: matTitle({ name: r.libMat.name, thickness: r.libMat.thickness }), parts: Object.keys(parts).map(function (k) { return parts[k]; }).sort(function (a, b) { return a.i - b.i; }) };
  });
}

function buildQuoteHtml() {
  const q = quoteSettings(), qj = ensureQuoteJob(), f = currentFigures(), b = q.business;
  const jr = (((document.getElementById('job-ref') || {}).value) || '').trim();
  const today = new Date(), until = new Date(today.getTime() + Math.max(0, +q.validDays || 0) * 86400000);
  const co = (settings.companyName || '').trim();
  const lines = [];
  f.mats.forEach(function (m) {
    const t = matTitle(m);
    if (q.layout === 'summary') {
      lines.push({ d: 'Supply and cut ' + t, sub: m.parts + ' part' + (m.parts !== 1 ? 's' : '') + ' as per parts list', qty: 1, amt: _r2(m.materialPrice + m.cutting + m.handling) });
      return;
    }
    if (q.charge === 'used') {
      lines.push({ d: t, sub: 'Material for ' + m.parts + ' part' + (m.parts !== 1 ? 's' : '') + ' (' + areaTxt(m.usedArea) + ')', qty: 1, amt: m.materialPrice });
    } else {
      m.sizes.forEach(function (z) { lines.push({ d: t + ' sheet', sub: dims(z.w, z.h), qty: z.count, unit: z.unitPrice, amt: z.amount }); });
    }
    lines.push({ d: 'Cutting — ' + t, sub: (m.method === 'guillotine' ? 'Saw: ' + m.cuts + ' cuts, ' : 'CNC: ' + m.cuts + ' part' + (m.cuts !== 1 ? 's' : '') + ', ') + quoteLen(m.cutLength) + ' cut length', qty: 1, amt: m.cutting });
  });
  if (q.layout !== 'summary' && f.handling) lines.push({ d: 'Handling', sub: 'Loading, unloading and stacking', qty: 1, amt: f.handling });
  if (f.setup) lines.push({ d: 'Setup', qty: 1, amt: f.setup });
  f.extras.forEach(function (x) { lines.push({ d: x.d || 'Extra', qty: 1, amt: x.a }); });

  const rows = lines.map(function (l) {
    return `<tr><td>${esc(l.d)}${l.sub ? `<div class="sub">${esc(l.sub)}</div>` : ''}</td><td class="n">${l.qty}</td><td class="n">${l.unit != null ? esc(money(l.unit)) : ''}</td><td class="n">${esc(money(l.amt))}</td></tr>`;
  }).join('');
  const bizLines = [b.address].concat([b.phone, b.email, b.web].filter(Boolean).join(' · ')).concat(b.taxNo ? [(q.taxLabel || 'Tax') + ' no. ' + b.taxNo] : []).filter(Boolean);
  const partsHtml = q.partsList ? quotePartsList().map(function (g) {
    return `<h3>Parts — ${esc(g.title)}</h3><table class="parts"><thead><tr><th>Part</th><th class="n">Size (${esc(unitLabel())})</th><th class="n">Qty</th></tr></thead><tbody>${
      g.parts.map(function (p) { return `<tr><td>${esc(p.label)}</td><td class="n">${esc(lenNum(p.w))} × ${esc(lenNum(p.h))}</td><td class="n">${p.qty}</td></tr>`; }).join('')}</tbody></table>`;
  }).join('') : '';
  const title = 'Quote ' + (qj.no || '') + (qj.customer ? ' — ' + qj.customer : '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
  @page { size: ${isInch() ? 'letter' : 'A4'}; margin: 16mm 15mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#13232b;font-size:10.5pt;line-height:1.45;background:#fff}
  .wrap{max-width:180mm;margin:0 auto}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:14px;border-bottom:2px solid #13232b}
  header img{max-height:22mm;max-width:70mm;object-fit:contain}
  .co{font-size:15pt;font-weight:800}
  .biz{text-align:right;font-size:9pt;color:#4a5d66;white-space:pre-line}
  .biz .co{color:#13232b;font-size:12pt;margin-bottom:2px}
  h1{font-size:22pt;letter-spacing:.06em;font-weight:800;margin:18px 0 12px}
  .meta{display:flex;justify-content:space-between;gap:20px;margin-bottom:18px}
  .to{font-size:10pt;white-space:pre-line}
  .to .k,.facts .k{font-size:8pt;text-transform:uppercase;letter-spacing:.08em;color:#6b7c84;font-weight:700}
  .to .name{font-weight:700;font-size:11pt}
  .facts{border-collapse:collapse;font-size:9.5pt}
  .facts td{padding:2px 0 2px 14px;text-align:right}
  table.lines,table.parts{width:100%;border-collapse:collapse}
  table.lines th,table.parts th{font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#6b7c84;text-align:left;border-bottom:1.5px solid #13232b;padding:6px 6px}
  table.lines td,table.parts td{padding:7px 6px;border-bottom:1px solid #e3e8ea;vertical-align:top}
  .n,table.lines th.n,table.parts th.n{text-align:right;white-space:nowrap}
  .sub{font-size:8.5pt;color:#6b7c84;margin-top:1px}
  .totals{margin-left:auto;width:78mm;margin-top:10px;border-collapse:collapse}
  .totals td{padding:4px 6px}
  .totals .grand td{border-top:2px solid #13232b;font-size:13pt;font-weight:800;padding-top:8px}
  .unit{text-align:right;font-size:9pt;color:#4a5d66;margin-top:4px}
  .notes{margin-top:18px;font-size:9.5pt;white-space:pre-line}
  h3{font-size:10pt;margin:22px 0 6px}
  table.parts td,table.parts th{font-size:9pt;padding:4px 6px}
  .terms{margin-top:24px;padding-top:10px;border-top:1px solid #e3e8ea;font-size:8.5pt;color:#6b7c84;white-space:pre-line}
  @media screen{body{background:#e9eef0;padding:24px 0}.wrap{background:#fff;padding:18mm 15mm;box-shadow:0 2px 12px rgba(0,0,0,.12)}}
  @media print{tr{break-inside:avoid}}
  </style></head><body><div class="wrap">
  <header>
    <div>${q.logo ? `<img src="${esc(q.logo)}" alt=""/>` : `<div class="co">${esc(co || 'Your business')}</div>`}</div>
    <div class="biz">${q.logo && co ? `<div class="co">${esc(co)}</div>` : ''}${esc(bizLines.join('\n'))}</div>
  </header>
  <h1>QUOTATION</h1>
  <div class="meta">
    <div class="to">${qj.customer || qj.contact ? `<div class="k">Quote for</div>${qj.customer ? `<div class="name">${esc(qj.customer)}</div>` : ''}${esc(qj.contact || '')}` : ''}</div>
    <table class="facts"><tbody>
      <tr><td class="k">Quote</td><td><b>${esc(qj.no || '')}</b></td></tr>
      <tr><td class="k">Date</td><td>${esc(quoteDate(today))}</td></tr>
      ${q.validDays ? `<tr><td class="k">Valid until</td><td>${esc(quoteDate(until))}</td></tr>` : ''}
      ${jr ? `<tr><td class="k">Job</td><td>${esc(jr)}</td></tr>` : ''}
      ${f.jobQty > 1 ? `<tr><td class="k">Quantity</td><td>${f.jobQty} units</td></tr>` : ''}
    </tbody></table>
  </div>
  <table class="lines"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="totals"><tbody>
    <tr><td>Subtotal</td><td class="n">${esc(money(f.subtotal))}</td></tr>
    ${f.taxRate ? `<tr><td>${esc(q.taxLabel || 'Tax')} at ${f.taxRate}%</td><td class="n">${esc(money(f.tax))}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="n">${esc(money(f.total))}</td></tr>
  </tbody></table>
  ${f.jobQty > 1 ? `<div class="unit">${esc(money(f.perUnit))} per unit</div>` : ''}
  ${qj.notes ? `<div class="notes">${esc(qj.notes)}</div>` : ''}
  ${partsHtml}
  ${q.terms ? `<div class="terms">${esc(q.terms)}</div>` : ''}
  </div></body></html>`;
}

function quoteText() {
  const q = quoteSettings(), qj = ensureQuoteJob(), f = currentFigures();
  const out = ['Quote ' + (qj.no || '') + (qj.customer ? ' for ' + qj.customer : '')];
  f.mats.forEach(function (m) {
    if (q.layout === 'summary') { out.push('Supply and cut ' + matTitle(m) + ' (' + m.parts + ' parts): ' + money(m.materialPrice + m.cutting + m.handling)); return; }
    if (q.charge === 'used') out.push(matTitle(m) + ' material: ' + money(m.materialPrice));
    else m.sizes.forEach(function (z) { out.push(matTitle(m) + ' ' + dims(z.w, z.h) + ': ' + z.count + ' × ' + money(z.unitPrice) + ' = ' + money(z.amount)); });
    out.push('Cutting ' + matTitle(m) + ': ' + money(m.cutting));
  });
  if (q.layout !== 'summary' && f.handling) out.push('Handling: ' + money(f.handling));
  if (f.setup) out.push('Setup: ' + money(f.setup));
  f.extras.forEach(function (x) { out.push((x.d || 'Extra') + ': ' + money(x.a)); });
  out.push('Subtotal: ' + money(f.subtotal));
  if (f.taxRate) out.push((q.taxLabel || 'Tax') + ' ' + f.taxRate + '%: ' + money(f.tax));
  out.push('Total: ' + money(f.total) + (f.jobQty > 1 ? ' (' + money(f.perUnit) + ' per unit × ' + f.jobQty + ')' : ''));
  return out.join('\n');
}
function copyQuoteText() {
  const t = quoteText();
  const done = function () { showToast('✓ Quote copied'); };
  const manual = function () {
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (ok) done(); else showToast('Your browser blocked copying — use Print instead');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, manual);
  else manual();
}

function printQuote() {
  const qj = ensureQuoteJob();
  // Using the suggested number uses it up, so the next job gets the next one.
  if (qj.no && qj.no === autoQuoteNo()) saveQuoteSettings({ nextNo: (parseInt(quoteSettings().nextNo, 10) || 1) + 1 });
  openPrintable(buildQuoteHtml(), 'Quote');
}
