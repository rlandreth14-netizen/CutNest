let KERF = 4;
const STOR_KEY = 'cutnest-lib-v1';
const COLORS = ['#1a6bbf','#0c9e6a','#e8960a','#c03050','#7c4ddb','#d9600a','#0891b2','#65a30d','#be185d','#0f766e','#1d4ed8','#b45309','#7e22ce','#15803d','#b91c1c'];

let library = [];
let pending = [];
let calcResult = null;

// Each mat entry: { id, selectedMatId, pieces: [{w,h,qty,label}] }
let mats = [
  { id: 'mat-1', selectedMatId: null, pieces: [{ w:'', h:'', qty:1 }] }
];

// ── STORAGE ──────────────────────────────────
function setSS(state, txt) {
  document.getElementById('sdot').className = 'sdot ' + state;
  document.getElementById('stxt').textContent = txt;
}
function defaultLib() { return []; }

function loadStarterPack(type) {
  const packs = {
    metal: [
      {id:Date.now()+1,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 2mm',material:'Mild Steel',thickness:'2mm',size1:{w:2450,h:1150,price:105},size2:{w:2050,h:900,price:65}},
      {id:Date.now()+2,allowRotation:false,cuttingMethod:'free',name:'S/S 2mm - 316 Brushed',material:'Stainless Steel',thickness:'2mm',size1:{w:2450,h:1150,price:225},size2:{w:1950,h:900,price:132}},
      {id:Date.now()+3,allowRotation:true,cuttingMethod:'free',name:'Galv 1.5mm',material:'Galvanised',thickness:'1.5mm',size1:{w:2450,h:1150,price:78},size2:{w:1950,h:900,price:48}}
    ],
    timber: [
      {id:Date.now()+1,allowRotation:true,cuttingMethod:'guillotine',name:'MDF 18mm',material:'Timber',thickness:'18mm',size1:{w:2440,h:1220,price:28},size2:{w:1220,h:610,price:15}},
      {id:Date.now()+2,allowRotation:false,cuttingMethod:'guillotine',name:'Plywood 18mm (Hardwood Face)',material:'Timber',thickness:'18mm',size1:{w:2440,h:1220,price:45},size2:{w:0,h:0,price:0}},
      {id:Date.now()+3,allowRotation:true,cuttingMethod:'guillotine',name:'MDF 12mm',material:'Timber',thickness:'12mm',size1:{w:2440,h:1220,price:22},size2:{w:1220,h:610,price:12}}
    ],
    acrylic: [
      {id:Date.now()+1,allowRotation:true,cuttingMethod:'free',name:'Acrylic 3mm Clear',material:'Acrylic',thickness:'3mm',size1:{w:2440,h:1220,price:55},size2:{w:1220,h:610,price:30}},
      {id:Date.now()+2,allowRotation:true,cuttingMethod:'free',name:'Acrylic 5mm Clear',material:'Acrylic',thickness:'5mm',size1:{w:2440,h:1220,price:85},size2:{w:1220,h:610,price:45}},
      {id:Date.now()+3,allowRotation:true,cuttingMethod:'free',name:'Acrylic 3mm White',material:'Acrylic',thickness:'3mm',size1:{w:2440,h:1220,price:58},size2:{w:1220,h:610,price:32}}
    ]
  };
  const pack = packs[type];
  if (!pack) return;
  library = pack.map(normalizeLibEntry);
  // Set a sensible default blade gap for the chosen trade so first-run numbers
  // are realistic without the user touching Settings. Sheet metal here means
  // laser/plasma profile cutting (~4mm); timber saw/router ~4mm; acrylic ~3mm.
  // Turret-punch users (rare default) can raise it in Settings — the copy there
  // tells them to. Only override if the user hasn't already chosen a kerf.
  if (!settings.kerfTouched) {
    const kerfByTrade = { metal: 4, timber: 4, acrylic: 3 };
    const k = kerfByTrade[type];
    if (k != null) {
      settings.kerf = k; KERF = k;
      try { localStorage.setItem(SETT_KEY, JSON.stringify(settings)); } catch(e){}
      const kd = document.getElementById('kerf-display'); if (kd) kd.textContent = KERF + 'mm';
    }
    // ...then confirm it, because the trade default is only a guess. A punch
    // shop picking "Sheet Metal" would otherwise silently run at 4mm forever.
    _pendingKerfAsk = true;
  }
  // Pre-select the first grade so the user lands ready to type pieces instead of
  // having to pick from a dropdown they just implicitly chose.
  if (mats && mats.length && library.length && !mats[0].selectedMatId) {
    mats[0].selectedMatId = library[0].id;
  }
  saveData(library).then(function() {
    renderAll();
    setSS('ok','Starter materials loaded');
    if (_pendingKerfAsk) { _pendingKerfAsk = false; setTimeout(askKerf, 350); }
  });
}

let _pendingKerfAsk = false;

function askKerf() {
  const m = document.getElementById('kerf-modal');
  if (m) m.style.display = 'flex';
}

// null = "not sure", which keeps whatever the trade default set but still marks
// the question as answered so it is never asked again.
function setKerfChoice(k) {
  if (k != null) {
    settings.kerf = k;
    KERF = k;
  }
  settings.kerfTouched = true;
  try { localStorage.setItem(SETT_KEY, JSON.stringify(settings)); } catch(e){}
  const kd = document.getElementById('kerf-display'); if (kd) kd.textContent = KERF + 'mm';
  const m = document.getElementById('kerf-modal'); if (m) m.style.display = 'none';
  showToast('\u2713 Kerf set to ' + KERF + 'mm \u2014 change it any time in Settings');
}

function renderAll() {
  const wrap = document.getElementById('mat-blocks');
  if (!wrap) return;
  if (!library || library.length === 0) {
    const w = `<div style="background:var(--white);border:1px solid var(--bdr);border-radius:16px;padding:36px 28px;text-align:center;margin-bottom:18px;box-shadow:var(--sh2)">
      <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,var(--teal2),var(--teal));display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 6px 20px rgba(15,76,92,.25)">
        <svg width="30" height="30" viewBox="0 0 36 36" fill="none"><rect x="3" y="3" width="12" height="9" rx="2" fill="#f59e0b"/><rect x="18" y="3" width="15" height="15" rx="2" fill="white" opacity=".9"/><rect x="3" y="14" width="12" height="19" rx="2" fill="white" opacity=".9"/><rect x="18" y="20" width="15" height="13" rx="2" fill="#f59e0b" opacity=".85"/></svg>
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;color:var(--teal);margin-bottom:8px;letter-spacing:-.3px">Welcome to CutNest</div>
      <p style="font-size:14px;color:var(--muted);margin-bottom:24px;line-height:1.7;max-width:420px;margin-left:auto;margin-right:auto">Pick your trade and we'll load the right sheet materials in seconds. You'll be running your first optimised cut list in under a minute.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:20px">
        <button onclick="loadStarterPack('metal')" style="background:var(--teal);border:none;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;padding:13px 26px;border-radius:10px;cursor:pointer;letter-spacing:.5px;transition:.2s;box-shadow:0 4px 14px rgba(15,76,92,.25)" onmouseover="this.style.filter='brightness(1.12)'" onmouseout="this.style.filter=''">🔩 Sheet Metal</button>
        <button onclick="loadStarterPack('timber')" style="background:var(--teal);border:none;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;padding:13px 26px;border-radius:10px;cursor:pointer;letter-spacing:.5px;transition:.2s;box-shadow:0 4px 14px rgba(15,76,92,.25)" onmouseover="this.style.filter='brightness(1.12)'" onmouseout="this.style.filter=''">🪵 Timber &amp; Joinery</button>
        <button onclick="loadStarterPack('acrylic')" style="background:var(--teal);border:none;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;padding:13px 26px;border-radius:10px;cursor:pointer;letter-spacing:.5px;transition:.2s;box-shadow:0 4px 14px rgba(15,76,92,.25)" onmouseover="this.style.filter='brightness(1.12)'" onmouseout="this.style.filter=''">🔵 Acrylic &amp; Plastics</button>
      </div>
      <div style="display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-bottom:20px;font-size:12px;color:var(--muted)">
        <span>✓ Starter prices included</span>
        <span>✓ Edit anytime in Library</span>
        <span>✓ Add your own materials too</span>
      </div>
      <button onclick="openLib()" style="background:none;border:1.5px dashed var(--bdr2);color:var(--muted);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;padding:8px 20px;border-radius:8px;cursor:pointer;transition:.15s" onmouseover="this.style.borderColor='var(--teal3)';this.style.color='var(--teal3)'" onmouseout="this.style.borderColor='var(--bdr2)';this.style.color='var(--muted)'">Or build your own library from scratch →</button>
    </div>`;
    wrap.innerHTML = w;
    return;
  }
  wrap.innerHTML = mats.map(function(m, idx) { return buildBlock(m, idx); }).join('');
  const amw = document.getElementById('add-mat-wrap');
  if (amw) amw.style.display = (isPro && mats && mats.length < 5) ? 'block' : 'none';
}
// Group a free-text material into a coarse category for the dropdown's
// optgroups (Metal / Timber / Plastic & Other / Other). Keyword-based so it
// works on whatever the user typed in the Material field, with a safe "Other"
// fallback. Purely for display ordering — it never changes packing or data.
function materialCategory(mat, name) {
  const s = ((mat||'') + ' ' + (name||'')).toLowerCase();
  if (/\b(steel|stainless|s\/s|galv|zintec|alu|aluminium|aluminum|metal|mild|brass|copper|zinc|tread|cr4|hr4)\b/.test(s)) return 'Metal';
  if (/\b(timber|wood|mdf|ply|plywood|osb|oak|pine|birch|chipboard|melamine|decking|deck|hardwood|softwood|veneer|board)\b/.test(s)) return 'Timber';
  if (/\b(acrylic|perspex|plastic|polycarb|poly|pvc|hdpe|abs|foamex|dibond|composite|glass)\b/.test(s)) return 'Plastic & Other';
  return 'Other';
}

function buildBlock(m, idx) {
  const libMat = library.find(l => l.id == m.selectedMatId);
  // Build the option for a single library material (escaped; preserves the
  // exact value + selected logic the rest of the app relies on).
  const optFor = function(l){
    return `<option value="${l.id}" ${m.selectedMatId==l.id?'selected':''}>${esc(l.name)}${l.thickness?' · '+esc(l.thickness):''}</option>`;
  };
  // Group materials into category sections so a timber-only (or metal-only) user
  // can jump straight to their section instead of scrolling a flat mixed list.
  // Order is fixed; empty groups are skipped; categories with only one bucket
  // fall back to a plain flat list so we never show a single pointless heading.
  const GROUP_ORDER = ['Metal','Timber','Plastic & Other','Other'];
  const buckets = {};
  library.forEach(function(l){
    const cat = materialCategory(l.material, l.name);
    (buckets[cat] = buckets[cat] || []).push(l);
  });
  const usedGroups = GROUP_ORDER.filter(function(g){ return buckets[g] && buckets[g].length; });
  let opts;
  if (usedGroups.length <= 1) {
    // All one category (or empty): no point grouping — keep it a flat list.
    opts = library.map(optFor).join('');
  } else {
    opts = usedGroups.map(function(g){
      const inner = buckets[g].map(optFor).join('');
      return `<optgroup label="${esc(g)}">${inner}</optgroup>`;
    }).join('');
  }

  // size info
  let sizeHtml = '';
  if (libMat) {
    sizeHtml = `
      <div class="sz-info-row">
        ${sizeBadgesHtml(libMat)}
        <div class="sz-auto-note">The optimiser picks the best mix</div>
      </div>
      ${!isPro && (libMat.allowRotation === false || libMat.cuttingMethod === 'guillotine')
        ? `<div style="font-size:11.5px;color:#92400e;background:#fffbeb;border:1px solid var(--amber);border-radius:7px;padding:6px 10px;margin-bottom:8px">&#128274; ${libMat.allowRotation === false && libMat.cuttingMethod === 'guillotine' ? 'Grain lock and guillotine mode are' : libMat.allowRotation === false ? 'Grain lock is' : 'Guillotine mode is'} Pro. On the free plan this material is calculated with free placement and rotation allowed. <button onclick="showUpgradeModal('&#128274;','Grain lock &amp; guillotine mode','Pro keeps grain direction on brushed, veneered and patterned sheet, and nests for saws and shears with a numbered edge-to-edge cut sequence.')" style="background:none;border:none;color:var(--teal);font-weight:700;cursor:pointer;padding:0;font-size:11.5px;text-decoration:underline;font-family:inherit">Unlock</button></div>`
        : ''}
      ${m.remnant && m.remnant.w && m.remnant.h
        ? `<div class="remnant-active">
             <span>&#9000;</span>
             <span>Remnant: ${m.remnant.w}&times;${m.remnant.h}mm &mdash; ${isPro ? 'used first' : 'Pro only, not used on the free plan'}</span>
             <button class="remnant-remove" onclick="removeRemnant('${m.id}')">&times;</button>
           </div>`
        : `<button class="btn-add-remnant" onclick="openRemnantInput('${m.id}')">+ Got a leftover piece? Add remnant${isPro ? '' : ' &#128274;'}</button>${isPro ? offcutPickerHtml(m, libMat) : ''}`
      }
      <div class="remnant-form" id="remnant-form-${m.id}" style="display:none">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Leftover sheet dimensions</div>
        <div class="remnant-form-grid">
          <div><label class="lbl">Width (mm)</label><input type="number" id="rem-w-${m.id}" placeholder="1200" min="10"/></div>
          <div><label class="lbl">Height (mm)</label><input type="number" id="rem-h-${m.id}" placeholder="600" min="10"/></div>
          <div>
            <button class="btn btn-teal" onclick="saveRemnant('${m.id}')" style="padding:7px 13px;margin-top:17px">Use it</button>
            <button class="btn btn-out" onclick="cancelRemnant('${m.id}')" style="padding:7px 10px;margin-top:17px;margin-left:4px">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  // pieces rows — spreadsheet-style keyboard flow: Label→W→H→Qty→Enter=new row
  const pRows = m.pieces.map((p, pi) => `
    <tr id="prow-${m.id}-${pi}">
      <td style="color:var(--muted);font-size:11px;text-align:center;width:26px" data-label="#">${pi+1}</td>
      <td data-label="Label">
        <input type="text"
          value="${esc(p.label||'')}"
          placeholder="Label (optional)"
          aria-label="Piece ${pi+1} label"
          style="min-width:90px;font-size:12px"
          oninput="updatePiece('${m.id}',${pi},'label',this.value)"
          onfocus="this.select()"
          onkeydown="handlePieceKey(event,'${m.id}',${pi},'label')"/>
      </td>
      <td data-label="W (mm)">
        <input type="number"
          value="${p.w||''}"
          placeholder="Width"
          aria-label="Piece ${pi+1} width in mm"
          style="width:78px;text-align:center"
          oninput="updatePiece('${m.id}',${pi},'w',+this.value)"
          onfocus="this.select()"
          onkeydown="handlePieceKey(event,'${m.id}',${pi},'w')"/>
      </td>
      <td data-label="H (mm)">
        <input type="number"
          value="${p.h||''}"
          placeholder="Height"
          aria-label="Piece ${pi+1} height in mm"
          style="width:78px;text-align:center"
          oninput="updatePiece('${m.id}',${pi},'h',+this.value)"
          onfocus="this.select()"
          onkeydown="handlePieceKey(event,'${m.id}',${pi},'h')"/>
      </td>
      <td data-label="Qty" style="white-space:nowrap;width:108px">
        <div class="qty-wrap-mobile">
          <button class="qty-btn" onclick="stepQty('${m.id}',${pi},-1)" type="button" aria-label="Decrease piece ${pi+1} quantity">−</button>
          <input class="qty-input-mobile"
            aria-label="Piece ${pi+1} quantity"
            type="number"
            value="${p.qty||1}"
            min="1" max="9999"
            oninput="updatePiece('${m.id}',${pi},'qty',Math.max(1,+this.value))"
            onfocus="this.select()"
            onkeydown="handlePieceKey(event,'${m.id}',${pi},'qty')"/>
          <button class="qty-btn" onclick="stepQty('${m.id}',${pi},1)" type="button" aria-label="Increase piece ${pi+1} quantity">+</button>
        </div>
      </td>
      <td style="white-space:nowrap;padding:4px 2px" data-label="Actions">
        <button onclick="duplicatePiece('${m.id}',${pi})" title="Duplicate piece" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;padding:2px 5px" aria-label="Duplicate">⧉</button>
        <button class="btn-del" onclick="removePiece('${m.id}',${pi})" aria-label="Remove piece ${pi+1}">&#10005;</button>
      </td>
    </tr>`).join('');

  return `
    <div class="mat-block no-print" id="block-${m.id}">
      <div class="mat-block-cap">
        <div class="mat-cap-left">
          <div class="mat-num">${idx+1}</div>
          <div>
            <div class="mat-cap-title">
              Material ${idx+1}${libMat ? ' — ' + esc(libMat.name) : ''}
            </div>
            <div class="mat-cap-subtitle">Select material then enter the pieces to cut from it</div>
          </div>
        </div>
        ${mats.length > 1
          ? `<button class="btn-remove-mat" onclick="removeMat('${m.id}')">✕ Remove</button>`
          : ''}
      </div>

      <div class="mat-body">
        <!-- Material selector -->
        <div class="mat-select-row">
          <div class="sel-wrap">
            <label class="lbl">Select material from library</label>
            <select onchange="onMatSelect('${m.id}', this.value)" aria-label="Material ${idx+1}">
              <option value="">— Choose a material —</option>
              ${opts}
            </select>
          </div>
          <button class="btn btn-out" onclick="openLib()" style="white-space:nowrap;flex-shrink:0">+ Add to Library</button>
        </div>

        ${sizeHtml}

        <hr class="block-divider"/>

        <!-- Pieces -->
        <div class="pieces-label">Required Pieces for This Material
          <span class="piece-count-badge" id="pcount-${m.id}">${pieceCountText(m)}</span>
        </div>
        <div class="pieces-table-wrap" style="overflow-x:auto">
          <table>
            <thead><tr><th style="width:26px">#</th><th>Label</th><th>W (mm)</th><th>H (mm)</th><th style="width:90px">Qty</th><th style="width:52px"></th></tr></thead>
            <tbody id="ptbody-${m.id}">${pRows}</tbody>
          </table>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn-add-piece" onclick="addPiece('${m.id}')">+ Add Piece</button>
          <button class="btn-add-piece" onclick="openPaste('${m.id}')" style="border-style:solid;border-color:var(--teal3);color:var(--teal)">📋 Paste list</button>
          <button class="btn-add-piece" onclick="addMultiplePieces('${m.id}')" style="font-size:12px">+ Add
            <input type="number" id="bulk-qty-${m.id}" value="5" min="2" max="50" style="width:36px;margin:0 2px;padding:2px 4px;font-size:12px;display:inline-block" onclick="event.stopPropagation()" /> rows
          </button>
        </div>
      </div>
    </div>`;
}


// ── PASTE A CUT LIST ──────────────────────────────────────────
// The only bulk tool was "+ Add 5 empty rows". Every fabricator already has the
// sizes somewhere — an email, a drawing schedule, an Excel column, a text from
// site — and entering a 30-piece job by hand on a phone is ~90 taps. This parser
// accepts the formats people actually have, forgivingly:
//   600x400x4        600 x 400 x 4      600*400*4
//   600x400          600 400 4          600,400,4
//   Door Front,800,600,4                Door Front  800  600  4   (Excel paste)
//   4 off 600x400    600x400 qty 4      600mm x 400mm x 4
// Anything it cannot read is reported line by line rather than silently dropped.
function parsePastedPieces(text) {
  const rows = [], errors = [];
  String(text || '').split(/\r?\n/).forEach(function (raw, i) {
    let line = String(raw || '').trim();
    if (!line) return;
    if (/^[#/]/.test(line)) return;                 // comment line
    if (!/\d/.test(line)) return;                   // header row / prose: no numbers at all

    // Normalise: × -> x, drop unit suffixes and stray quotes.
    line = line.replace(/\u00d7/g, 'x')
               .replace(/\bmm\b/gi, ' ')
               .replace(/["']/g, ' ');

    // THOUSANDS SEPARATORS. A comma is ambiguous: in "600,400,4" it separates
    // fields, but in "1,200 x 800 x 4" it is a thousands separator — and read
    // the wrong way that line becomes 800 pieces of 1x200mm, silently. Rule:
    // if the line already uses x / * as its dimension separator, then any comma
    // sitting between a digit and exactly three digits is a thousands mark.
    if (/[x*]/i.test(line)) line = line.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');

    // Leading trade quantity: "4 off 600x400", "4 no 600x400", "4 pcs ..."
    let leadQty = null;
    const lead = line.match(/^\s*(\d+)\s*(?:off|no\.?|nr|pcs?|pieces?)\s+(.*)$/i);
    if (lead) { leadQty = parseInt(lead[1], 10); line = lead[2]; }

    // Explicit qty keyword anywhere: "600x400 qty 4"
    let kwQty = null;
    const kw = line.match(/\bqty\.?\s*[:=]?\s*(\d+)\b/i);
    if (kw) { kwQty = parseInt(kw[1], 10); line = line.replace(kw[0], ' '); }

    // Split into cells when the line is delimited; otherwise treat as one cell.
    const cells = /[\t,;]/.test(line)
      ? line.split(/[\t,;]+/).map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; })
      : [line];

    // Label = the first cell containing no digits (Excel/CSV style), else the
    // leading text before the first number on a freeform line.
    let label = '';
    const numeric = [];
    if (cells.length > 1) {
      cells.forEach(function (c) {
        if (/^-?\d*\.?\d+$/.test(c.replace(/\s/g, ''))) numeric.push(parseFloat(c));
        else if (/\d/.test(c)) {
          // A cell like "600x400" inside a CSV row.
          (c.match(/\d*\.?\d+/g) || []).forEach(function (n) { numeric.push(parseFloat(n)); });
        } else if (!label) label = c.trim();
      });
    } else {
      const m = line.match(/^([^\d]*?)(?=\d)/);
      if (m && m[1]) label = m[1].replace(/[\sx*:\-]+$/i, '').trim();
      const rest = line.slice(m && m[1] ? m[1].length : 0);
      (rest.match(/\d*\.?\d+/g) || []).forEach(function (n) { numeric.push(parseFloat(n)); });
    }

    if (numeric.length < 2) {
      errors.push('Line ' + (i + 1) + ': need a width and a height \u2014 "' + raw.trim().slice(0, 40) + '"');
      return;
    }

    const w = numeric[0], h = numeric[1];
    let qty = leadQty != null ? leadQty
            : kwQty  != null ? kwQty
            : (numeric.length >= 3 ? numeric[2] : 1);

    if (!(w > 0) || !(h > 0)) {
      errors.push('Line ' + (i + 1) + ': width and height must be greater than 0 \u2014 "' + raw.trim().slice(0, 40) + '"');
      return;
    }
    if (w > 99999 || h > 99999) {
      errors.push('Line ' + (i + 1) + ': dimension looks wrong (over 99999mm) \u2014 "' + raw.trim().slice(0, 40) + '"');
      return;
    }
    qty = Math.max(1, Math.min(9999, Math.round(qty) || 1));

    // SUSPICIOUS-ROW WARNINGS. The parser is deliberately forgiving, which means
    // an unusual line can parse to something technically valid but obviously
    // wrong ("6e2 x 4e2" reads as 6x2mm). Rather than pretend to handle every
    // notation, flag anything that does not look like a real part so the user
    // sees it in the preview instead of finding out at the saw.
    let warn = null;
    if (w < 5 || h < 5) warn = 'dimension under 5mm \u2014 check this line';
    else if (qty > 500) warn = 'quantity over 500 \u2014 check this line';
    rows.push({ w: w, h: h, qty: qty, label: label.slice(0, 40), warn: warn });
  });
  return { rows: rows, errors: errors };
}

const PASTE_ROW_LIMIT = 500;   // same ceiling as the shared-link importer
let _pasteTargetMat = null;

function openPaste(matId) {
  _pasteTargetMat = matId;
  const ta = document.getElementById('paste-input');
  if (ta) ta.value = '';
  const rep = document.getElementById('paste-replace');
  if (rep) rep.checked = false;
  renderPastePreview();
  const m = document.getElementById('paste-modal');
  if (m) m.style.display = 'flex';
  if (ta) setTimeout(function () { ta.focus(); }, 60);
}
function closePaste() {
  const m = document.getElementById('paste-modal');
  if (m) m.style.display = 'none';
}

function renderPastePreview() {
  const ta = document.getElementById('paste-input');
  const out = document.getElementById('paste-preview');
  const btn = document.getElementById('paste-confirm');
  if (!ta || !out) return;
  const res = parsePastedPieces(ta.value);
  if (!ta.value.trim()) {
    out.innerHTML = '<div style="color:var(--muted);font-size:13px">Paste or type your list above and it will be parsed here before anything is added.</div>';
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.textContent = 'Add pieces'; }
    return;
  }
  const totalCuts = res.rows.reduce(function (a, r) { return a + r.qty; }, 0);
  const warned = res.rows.filter(function (r) { return r.warn; }).length;
  let html = '';
  if (warned) {
    html += '<div style="background:#fffbeb;border:1px solid var(--amber);border-radius:8px;padding:8px 11px;margin-bottom:8px;font-size:12px;color:#92400e;line-height:1.5">' +
            '<b>\u26a0 ' + warned + ' row' + (warned !== 1 ? 's look' : ' looks') + ' wrong</b> \u2014 highlighted below. ' +
            'Common cause: a thousands separator or an unusual format. Fix the line and re-paste, or add them and correct them in the table.</div>';
  }
  if (res.rows.length > PASTE_ROW_LIMIT) {
    html += '<div style="background:#fff5f5;border:1px solid var(--red);border-radius:8px;padding:8px 11px;margin-bottom:8px;font-size:12px;color:var(--red)">' +
            'Only the first ' + PASTE_ROW_LIMIT + ' rows will be added (' + res.rows.length + ' found).</div>';
  }
  if (res.rows.length) {
    html += '<div style="font-size:12px;color:var(--teal);font-weight:700;margin-bottom:6px">\u2713 ' + res.rows.length +
            ' row' + (res.rows.length !== 1 ? 's' : '') + ' \u00b7 ' + totalCuts + ' total cut' + (totalCuts !== 1 ? 's' : '') + '</div>';
    html += '<div style="max-height:180px;overflow:auto;border:1px solid var(--bdr);border-radius:8px"><table style="font-size:12px">' +
            '<thead><tr><th>Label</th><th>W</th><th>H</th><th>Qty</th><th></th></tr></thead><tbody>' +
            res.rows.slice(0, 100).map(function (r) {
              const bad = r.warn ? ' style="background:#fff5f5;color:#b91c1c;font-weight:600"' : '';
              return '<tr' + bad + '><td>' + esc(r.label || '\u2014') + '</td><td>' + r.w + '</td><td>' + r.h + '</td><td>' + r.qty +
                     '</td><td style="font-size:11px">' + (r.warn ? '\u26a0 ' + esc(r.warn) : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    if (res.rows.length > 100) html += '<div style="font-size:11px;color:var(--muted);margin-top:5px">(showing first 100)</div>';
  }
  if (res.errors.length) {
    html += '<div style="background:#fff5f5;border:1px solid var(--red);border-radius:8px;padding:9px 11px;margin-top:8px;font-size:12px;color:var(--red);line-height:1.6">' +
            '<b>' + res.errors.length + ' line' + (res.errors.length !== 1 ? 's' : '') + ' could not be read \u2014 they will be skipped:</b><br>' +
            res.errors.slice(0, 8).map(esc).join('<br>') +
            (res.errors.length > 8 ? '<br>\u2026and ' + (res.errors.length - 8) + ' more' : '') + '</div>';
  }
  out.innerHTML = html;
  if (btn) {
    btn.disabled = !res.rows.length;
    btn.style.opacity = res.rows.length ? '1' : '.5';
    const willAdd = Math.min(res.rows.length, PASTE_ROW_LIMIT);
    btn.textContent = res.rows.length ? ('Add ' + willAdd + ' row' + (willAdd !== 1 ? 's' : '')) : 'Nothing to add';
  }
}

function confirmPaste() {
  const ta = document.getElementById('paste-input');
  const m = mats.find(function (x) { return x.id === _pasteTargetMat; });
  if (!ta || !m) return;
  const res = parsePastedPieces(ta.value);
  if (!res.rows.length) return;
  pushUndo();
  const replace = (document.getElementById('paste-replace') || {}).checked;
  // Blank starter rows are noise once real pieces arrive.
  const existing = replace ? [] : m.pieces.filter(function (p) { return p.w > 0 && p.h > 0; });
  // Hard cap, matching the shared-link importer. Without it a stray paste of a
  // 10,000-line file would be accepted whole, then rendered as 10,000 table
  // rows and written to localStorage on every keystroke.
  const room = Math.max(0, PASTE_ROW_LIMIT - existing.length);
  m.pieces = existing.concat(res.rows.slice(0, room).map(function (r) {
    return { w: r.w, h: r.h, qty: r.qty, label: r.label };   // drop the warn flag
  }));
  if (!m.pieces.length) m.pieces = [{ w: '', h: '', qty: 1, label: '' }];
  closePaste();
  renderAll();
  saveState();
  const cuts = res.rows.reduce(function (a, r) { return a + r.qty; }, 0);
  showToast('\u2713 Added ' + res.rows.length + ' row' + (res.rows.length !== 1 ? 's' : '') + ' \u00b7 ' + cuts + ' cuts');
  if (calcResult) { const sb = document.getElementById('stale-banner'); if (sb) sb.style.display = 'block'; }
}


// ── OFFCUT STOCK ──────────────────────────────────────────────
// CutNest has always reported "Reclaim Offcuts: 2" and printed "KEEP OFFCUT"
// on the cut sheet — then given the user nowhere to put it. The number was
// unactionable. This is the missing half: save a usable offcut against its
// material, and offer it back as the remnant on the next job in that material.
const OFFCUT_KEY = 'cutnest-offcuts-v1';
const OFFCUT_MAX = 200;

function loadOffcuts() {
  try {
    const raw = localStorage.getItem(OFFCUT_KEY);
    const a = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(a)) return [];
    // Heal anything malformed rather than letting one bad row break the list.
    return a.filter(function (o) {
      return o && +o.w >= 10 && +o.h >= 10;
    }).map(function (o) {
      return {
        id: o.id || ('oc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
        matId: o.matId != null ? o.matId : null,
        matName: String(o.matName || 'Unknown material').slice(0, 60),
        w: Math.round(+o.w), h: Math.round(+o.h),
        added: o.added || new Date().toISOString(),
        jobRef: String(o.jobRef || '').slice(0, 40)
      };
    }).slice(0, OFFCUT_MAX);
  } catch (e) { return []; }
}

function saveOffcuts(list) {
  try { localStorage.setItem(OFFCUT_KEY, JSON.stringify((list || []).slice(0, OFFCUT_MAX))); }
  catch (e) { /* quota: the job itself matters more than the offcut list */ }
}

function offcutsFor(matId) {
  if (matId == null) return [];
  return loadOffcuts().filter(function (o) { return o.matId == matId; });
}

// Add one offcut to stock. Returns false if an identical piece is already
// there, so double-tapping Save does not create duplicates.
function addOffcut(matId, matName, w, h, jobRef) {
  w = Math.round(+w); h = Math.round(+h);
  if (!(w >= 10 && h >= 10)) return false;
  const list = loadOffcuts();
  const dupe = list.some(function (o) {
    return o.matId == matId && o.w === w && o.h === h;
  });
  if (dupe) return false;
  list.unshift({
    id: 'oc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    matId: matId, matName: matName, w: w, h: h,
    added: new Date().toISOString(),
    jobRef: jobRef || ''
  });
  saveOffcuts(list);
  return true;
}

function removeOffcut(id) {
  saveOffcuts(loadOffcuts().filter(function (o) { return o.id !== id; }));
}

// Save every usable offcut from the current result in one go.
function saveAllOffcuts() {
  if (!isPro) { showUpgradeModal.apply(null, REMNANT_UPSELL); return; }
  if (!calcResult || !calcResult.results) return;
  const jr = ((document.getElementById('job-ref') || {}).value || '').trim();
  let added = 0, skipped = 0;
  calcResult.results.forEach(function (r) {
    const matId = r.libMat && r.libMat.id;
    r.sheets.forEach(function (sh) {
      // Only offcuts big enough to be worth keeping, and never off a remnant
      // sheet — that piece is already in stock, re-adding it double-counts.
      if (!sh.usableOffcut || !sh.offcut || sh.isRemnant) return;
      if (addOffcut(matId, r.libMat.name, sh.offcut.w, sh.offcut.h, jr)) added++;
      else skipped++;
    });
  });
  renderAll();
  if (added) showToast('\u2713 ' + added + ' offcut' + (added !== 1 ? 's' : '') + ' saved to stock' +
                       (skipped ? ' (' + skipped + ' already there)' : ''));
  else if (skipped) showToast('Those offcuts are already in your stock');
  else showToast('No reclaimable offcuts on this job');
}

function useOffcut(matId, offcutId) {
  if (!isPro) { showUpgradeModal.apply(null, REMNANT_UPSELL); return; }
  const o = loadOffcuts().find(function (x) { return x.id === offcutId; });
  const m = mats.find(function (x) { return x.id === matId; });
  if (!o || !m) return;
  pushUndo();
  m.remnant = { w: o.w, h: o.h };
  m.remnantFromStock = o.id;   // so it can be retired once it has been cut
  renderAll(); saveState();
  showToast('Using your ' + o.w + '\u00d7' + o.h + 'mm offcut');
}

// Called after a calculate that actually consumed a stock offcut.
function retireUsedOffcut(matId) {
  const m = mats.find(function (x) { return x.id === matId; });
  if (!m || !m.remnantFromStock) return;
  removeOffcut(m.remnantFromStock);
  delete m.remnantFromStock;
  m.remnant = null;
  renderAll(); saveState();
  showToast('\u2713 Offcut removed from stock \u2014 it has been cut');
}

function offcutPickerHtml(m, libMat) {
  if (!libMat) return '';
  const list = offcutsFor(libMat.id);
  if (!list.length) return '';
  return '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    '<span style="font-size:11px;color:var(--muted);font-weight:600">From your offcut stock:</span>' +
    list.slice(0, 8).map(function (o) {
      return '<button class="btn-add-remnant" style="border-style:solid;border-color:#6ee7b7;color:#065f46"' +
             ' onclick="useOffcut(\'' + m.id + '\',\'' + o.id + '\')">' +
             o.w + '\u00d7' + o.h + 'mm</button>';
    }).join('') +
    (list.length > 8 ? '<span style="font-size:11px;color:var(--muted)">+' + (list.length - 8) + ' more</span>' : '') +
    '</div>';
}

// ── OFFCUT STOCK MODAL ──
function openOffcuts() {
  if (!isPro) { showUpgradeModal.apply(null, REMNANT_UPSELL); return; }
  renderOffcutList();
  const el = document.getElementById('offcut-modal');
  if (el) el.style.display = 'flex';
}
function closeOffcuts() {
  const el = document.getElementById('offcut-modal');
  if (el) el.style.display = 'none';
  renderAll();
}
function deleteOffcut(id) { removeOffcut(id); renderOffcutList(); }
function clearAllOffcuts() {
  if (!confirm('Remove every offcut from your stock list?')) return;
  saveOffcuts([]);
  renderOffcutList();
  showToast('Offcut stock cleared');
}

function renderOffcutList() {
  const wrap = document.getElementById('offcut-list');
  if (!wrap) return;
  const list = loadOffcuts();
  if (!list.length) {
    wrap.innerHTML = '<p style="color:var(--muted);font-size:13px;line-height:1.6">' +
      'No offcuts saved yet.<br><br>Run a job, then use <b>Save offcuts</b> on the results to keep the ' +
      'reclaimable pieces. They will be offered back to you as a remnant on the next job in that material.</p>';
    return;
  }
  // Group by material so a shop with several grades can find things.
  const groups = {};
  list.forEach(function (o) {
    const k = o.matName || 'Unknown material';
    (groups[k] = groups[k] || []).push(o);
  });
  wrap.innerHTML = Object.keys(groups).sort().map(function (name) {
    const rows = groups[name].sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); }).map(function (o) {
      const d = new Date(o.added);
      const ds = isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bdr)">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700;color:var(--teal)">' + o.w + ' \u00d7 ' + o.h + 'mm</div>' +
          '<div style="font-size:11px;color:var(--muted)">' +
            (o.jobRef ? 'from ' + esc(o.jobRef) + ' \u00b7 ' : '') + ds +
            ' \u00b7 ' + ((o.w * o.h) / 1e6).toFixed(2) + ' m\u00b2</div>' +
        '</div>' +
        '<button class="btn-del" onclick="deleteOffcut(\'' + o.id + '\')">\u2715</button>' +
      '</div>';
    }).join('');
    const area = groups[name].reduce(function (a, o) { return a + o.w * o.h; }, 0) / 1e6;
    return '<div style="margin-bottom:14px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:3px">' +
        esc(name) + ' \u2014 ' + groups[name].length + ' piece' + (groups[name].length !== 1 ? 's' : '') +
        ' \u00b7 ' + area.toFixed(2) + ' m\u00b2</div>' + rows + '</div>';
  }).join('');
}

// ── MAT MANAGEMENT ────────────────────────────
function addMat() {
  pushUndo();
  mats.push({ id:'mat-'+Date.now(), selectedMatId:null, pieces:[{w:'',h:'',qty:1,label:''}] });
  renderAll();
}
function removeMat(id) {
  if (mats.length <= 1) return;
  pushUndo();
  mats = mats.filter(m => m.id !== id);
  renderAll();
}
function onMatSelect(id, val) {
  const m = mats.find(m => m.id === id);
  if (m) {
    pushUndo();
    // Do NOT parseInt: shared-link materials use ids like 'shared-1750…-0' and
    // normalizeLibEntry falls back to 'lib-…', both of which parseInt turns into
    // NaN — silently losing the material the moment the dropdown is touched.
    // Everything downstream compares with == so a string id is fine.
    m.selectedMatId = val || null;
    renderAll();
  }
}

// ── PIECE MANAGEMENT ─────────────────────────
function addPiece(matId) {
  const m = mats.find(m => m.id === matId);
  if (m) { pushUndo(); m.pieces.push({w:'',h:'',qty:1,label:''}); renderAll(); saveState(); }
}
function removePiece(matId, pi) {
  const m = mats.find(m => m.id === matId);
  if (m && m.pieces.length > 1) { pushUndo(); m.pieces.splice(pi,1); renderAll(); saveState(); }
}
function stepQty(matId, pi, delta) {
  const m = mats.find(m => m.id === matId);
  if (!m) return;
  pushUndoTyping();
  const cur = Math.max(1, Math.min(9999, (+m.pieces[pi].qty || 1) + delta));
  m.pieces[pi].qty = cur;
  // Update input directly for speed without full re-render
  const tbody = document.getElementById('ptbody-' + matId);
  if (tbody) {
    const row = tbody.rows[pi];
    if (row) {
      const inp = row.querySelector('.qty-input-mobile');
      if (inp) inp.value = cur;
    }
  }
  refreshPieceCount(m);
  saveState();
  if (calcResult) {
    const sb = document.getElementById('stale-banner');
    if (sb) sb.style.display = 'block';
  }
}

function handlePieceKey(e, matId, pi, field) {
  const FIELDS = ['label', 'w', 'h', 'qty'];
  const isEnter = e.key === 'Enter';
  const isTab   = e.key === 'Tab' && !e.shiftKey;
  const isShiftTab = e.key === 'Tab' && e.shiftKey;

  // Save current value immediately before any navigation
  if (isEnter || isTab || isShiftTab) {
    const m = mats.find(m => m.id === matId);
    if (m && m.pieces[pi]) {
      const raw = e.target.value;
      if (field === 'label') m.pieces[pi].label = raw;
      else if (field === 'w') m.pieces[pi].w = +raw || '';
      else if (field === 'h') m.pieces[pi].h = +raw || '';
      else if (field === 'qty') m.pieces[pi].qty = Math.max(1, +raw || 1);
    }
  }

  // ── ENTER key ──────────────────────────────────
  // Fast entry flow: Enter skips the optional Label. It cycles
  //   W → H → Qty → (next row) W → H → Qty → …
  // Label is never landed on via Enter; use Tab or click to fill it in later.
  if (isEnter) {
    e.preventDefault();
    if (field === 'label') {
      // If focus somehow starts on Label, Enter jumps straight into Width.
      focusPieceField(matId, pi, 'w');
    } else if (field === 'w') {
      focusPieceField(matId, pi, 'h');
    } else if (field === 'h') {
      focusPieceField(matId, pi, 'qty');
    } else if (field === 'qty') {
      const m = mats.find(m => m.id === matId);
      const isLastRow = m && pi >= m.pieces.length - 1;
      if (isLastRow) {
        // Last row → add a new row and drop straight into its Width.
        addPiece(matId);
        requestAnimationFrame(() => focusPieceField(matId, pi + 1, 'w'));
      } else {
        // Row already exists below → move to its Width (skip its Label).
        focusPieceField(matId, pi + 1, 'w');
      }
    }
    return;
  }

  // ── TAB key (forward) ──────────────────────────
  if (isTab) {
    const idx = FIELDS.indexOf(field);
    if (idx < FIELDS.length - 1) {
      // Advance within same row
      e.preventDefault();
      focusPieceField(matId, pi, FIELDS[idx + 1]);
    }
    // On qty tab-forward: let browser handle naturally to next focusable element
    return;
  }

  // ── SHIFT+TAB (backward) ───────────────────────
  if (isShiftTab) {
    const idx = FIELDS.indexOf(field);
    if (idx > 0) {
      e.preventDefault();
      focusPieceField(matId, pi, FIELDS[idx - 1]);
    } else if (pi > 0) {
      // At start of row → go to qty of previous row
      e.preventDefault();
      focusPieceField(matId, pi - 1, 'qty');
    }
  }
}

function focusPieceField(matId, pi, field) {
  const tbody = document.getElementById('ptbody-' + matId);
  if (!tbody) return;
  const row = tbody.rows[pi];
  if (!row) return;
  let inp = null;
  if (field === 'label') {
    inp = row.querySelector('input[type=text]');
  } else if (field === 'w') {
    const nums = row.querySelectorAll('input[type=number]:not(.qty-input-mobile)');
    inp = nums[0] || null;
  } else if (field === 'h') {
    const nums = row.querySelectorAll('input[type=number]:not(.qty-input-mobile)');
    inp = nums[1] || null;
  } else if (field === 'qty') {
    inp = row.querySelector('.qty-input-mobile');
  }
  if (inp) { inp.focus(); inp.select(); }
}

function showToast(msg, duration) {
  let t = document.getElementById('cn-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cn-toast';
    t.className = 'toast';
    t.setAttribute('role','status');
    t.setAttribute('aria-live','polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration || 2200);
}
// "3 pieces · 12 total cuts" — counts only rows with a real size, so a blank
// starter row is not a piece and does not add a cut.
function pieceCountText(m) {
  const real = m.pieces.filter(function(p){ return p.w > 0 && p.h > 0; });
  const cuts = real.reduce(function(a, p){ return a + (+p.qty || 1); }, 0);
  return real.length + ' piece' + (real.length !== 1 ? 's' : '') + ' \u00b7 ' + cuts + ' total cut' + (cuts !== 1 ? 's' : '');
}
// Typing and the qty buttons skip the full re-render, so refresh the badge here.
function refreshPieceCount(m) {
  const el = document.getElementById('pcount-' + m.id);
  if (el) el.textContent = pieceCountText(m);
}
function updatePiece(matId, pi, field, val) {
  const m = mats.find(m => m.id === matId);
  if (m) {
    pushUndoTyping();
    // Validate numeric fields
    if (field === 'w' || field === 'h') {
      val = Math.max(0, Math.min(99999, Number(val) || 0));
    }
    if (field === 'qty') {
      val = Math.max(1, Math.min(9999, Math.round(Number(val)) || 1));
    }
    m.pieces[pi][field] = val;
    refreshPieceCount(m);
    saveState();
    if (calcResult) {
      const sb = document.getElementById('stale-banner');
      if (sb) sb.style.display = 'block';
    }
  }
}

// ── ALGORITHM ─────────────────────────────────
// ── MAXRECTS FREE-PLACEMENT PACKING ENGINE ──────
// No guillotine constraint — pieces can be placed anywhere freely,
// matching how a CNC turret punch press actually cuts sheets.
// Uses the MaxRects Best Area Fit algorithm.




// Run packing with multiple piece orderings, pick best result for this sheet
// Effort level for packing, set once per job by runMat based on part count.
// Each maxRectsPack pass costs the same, so trying all 8 sorter strategies on a
// huge job multiplies an already-quadratic cost. The first strategy
// (largest-area-first) is by far the strongest single heuristic; strategies
// past the first few add little on big jobs. We try all 8 on small jobs and
// taper to 1 on very large ones. Correctness (no lost/overlapped/sub-kerf
// parts) is identical at every level — this only trades a little packing
// tightness for speed when the job is big.
let PACK_EFFORT = 8;


// ── SHOP-FLOOR CUT SHEETS ─────────────────────────────────────
// The audit's biggest finding: CutNest produced a provably optimal nest and
// then handed it to the operator as a 1:11 postage stamp with no numbers on it.
// This is the document that goes to the machine — one sheet per page, drawn
// large, every part dimensioned, a marked datum corner, and (where the layout
// allows) the numbered cut sequence.
function buildCutSheetsHtml() {
  if (!calcResult || !calcResult.results.length) return null;
  const co = (settings.companyName || '').trim();
  const jr = (((document.getElementById('job-ref') || {}).value) || '').trim();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  // A4 landscape working area in CSS px at 96dpi, minus 10mm margins:
  // 297-20 = 277mm wide (~1047px), 210-20 = 190mm tall (~718px).
  // The whole point of this document is ONE SHEET PER PAGE, so the drawing
  // height is whatever is left after the header, dimension line, tables and
  // footer have taken their share — not a fixed number that overflows.
  const PAGE_W = 1040, PAGE_H = 718;
  // These are MEASURED from a real print render, not guessed — an underestimate
  // pushes the tables onto a second page and destroys the one-sheet-per-page
  // guarantee that is the entire point of this document.
  const H_HEADER = 50, H_DIMX = 22, H_FOOTER = 24, H_NOTE = 24;
  const H_TBL_CHROME = 36;         // h3 + table header row
  const TBL_ROW = 18;              // measured row height at 10px font
  const SAFETY = 24;               // slack for font-metric differences per engine
  const MAX_TBL_ROWS = 10;         // beyond this, spill into another column

  let pages = '';
  calcResult.results.forEach(function (r) {
    const libMat = r.libMat;
    const buy = boughtSheets(r.sheets).length;
    r.sheets.forEach(function (sh, si) {
      const cuts = deriveGuillotineCuts(sh.placed, sh.sheetW, sh.sheetH, KERF);

      // Parts, sorted the way an operator works: top-left to bottom-right.
      const parts = sh.placed.slice().sort(function (a, b) {
        return (a.y - b.y) || (a.x - b.x);
      });

      // Chunk long lists into extra columns so the tables stay short and the
      // drawing keeps the space. A 40-part sheet becomes 4 columns of 10, not
      // one 40-row table that pushes the page over.
      const chunk = function (arr) {
        const cols = Math.max(1, Math.ceil(arr.length / MAX_TBL_ROWS));
        const per = Math.ceil(arr.length / cols);
        const out = [];
        for (let i = 0; i < arr.length; i += per) out.push(arr.slice(i, i + per));
        return out;
      };
      const partCols = chunk(parts);
      const cutCols  = chunk(cuts && cuts.length ? cuts : [null]);
      const tallest  = Math.max(partCols[0].length, cutCols[0].length);
      const tablesH  = H_TBL_CHROME + tallest * TBL_ROW;

      // Whatever is left is the drawing. Never smaller than 210px or the
      // drawing stops being useful — at that point the tables can spill.
      const DRAW_H = Math.max(200, PAGE_H - H_HEADER - H_DIMX - H_FOOTER - H_NOTE - tablesH - SAFETY);
      const scale = Math.min((PAGE_W - 70) / sh.sheetW, DRAW_H / sh.sheetH);
      const dw = sh.sheetW * scale, dh = sh.sheetH * scale;

      const rects = parts.map(function (p, i) {
        const x = p.x * scale, y = p.y * scale, w = p.w * scale, h = p.h * scale;
        // Only draw text that will actually be legible at this scale.
        const showDims = w > 54 && h > 30;
        const showNum  = w > 18 && h > 16;
        return `<div class="pt" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">
          ${showNum ? `<span class="pt-no">${i+1}</span>` : ''}
          ${showDims ? `<span class="pt-dim">${p.w}&times;${p.h}</span>
                        ${p.label ? `<span class="pt-lab">${esc(String(p.label).slice(0,22))}</span>` : ''}
                        ${p.rotated ? '<span class="pt-rot">&#8635; rotated</span>' : ''}` : ''}
        </div>`;
      }).join('');

      // Cut lines drawn over the layout, numbered in order.
      const cutMarks = (cuts || []).map(function (c) {
        const mid = ((c.from + c.to) / 2) * scale;
        return c.axis === 'V'
          ? `<div class="cut cut-v" style="left:${c.pos*scale}px;top:${c.from*scale}px;height:${(c.to-c.from)*scale}px"><span class="cut-no" style="top:${mid-(c.from*scale)-6}px">${c.no}</span></div>`
          : `<div class="cut cut-h" style="top:${c.pos*scale}px;left:${c.from*scale}px;width:${(c.to-c.from)*scale}px"><span class="cut-no" style="left:${mid-(c.from*scale)-6}px">${c.no}</span></div>`;
      }).join('');

      let startIdx = 0;
      const partTables = partCols.map(function (col) {
        const rows = col.map(function (p) {
          startIdx++;
          return `<tr><td class="c">${startIdx}</td><td>${esc(p.label || '\u2014')}</td>
            <td class="c">${p.w}</td><td class="c">${p.h}</td>
            <td class="c">${Math.round(p.x)}</td><td class="c">${Math.round(p.y)}</td>
            <td class="c">${p.rotated ? '&#8635;' : ''}</td></tr>`;
        }).join('');
        return `<table><thead><tr><th>#</th><th>Label</th><th>W</th><th>H</th><th>X</th><th>Y</th><th>Rot</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');

      const cutTables = (cuts && cuts.length)
        ? cutCols.map(function (col) {
            const rows = col.map(function (c) {
              return `<tr><td class="c">${c.no}</td><td>${c.axis === 'V' ? 'Rip (down)' : 'Crosscut (across)'}</td>
                <td class="c">${Math.round(c.pos)}mm</td>
                <td class="c">${Math.round(c.from)}\u2013${Math.round(c.to)}mm</td></tr>`;
            }).join('');
            return `<table><thead><tr><th>#</th><th>Cut</th><th>At</th><th>Span</th></tr></thead><tbody>${rows}</tbody></table>`;
          }).join('')
        : `<table><tbody><tr><td class="nocut">This layout is not guillotine-cuttable \u2014 parts must be cut
             individually (normal for free placement: laser, router, plasma).</td></tr></tbody></table>`;

      pages += `<section class="page">
        <header class="hd">
          <div>
            <div class="hd-t">${esc(libMat.name)}${libMat.thickness ? ' \u00b7 ' + esc(libMat.thickness) : ''}
              &mdash; Sheet ${si+1} of ${r.sheets.length}${sh.isRemnant ? ' (YOUR REMNANT)' : ''}</div>
            <div class="hd-m">${sh.sheetW} &times; ${sh.sheetH}mm &nbsp;\u00b7&nbsp; ${sh.placed.length} parts
              &nbsp;\u00b7&nbsp; ${sh.utilPercent || 0}% used
              &nbsp;\u00b7&nbsp; <b>Kerf ${KERF}mm</b>
              &nbsp;\u00b7&nbsp; ${libMat.allowRotation === false ? '<b>GRAIN LOCKED \u2014 do not rotate</b>' : 'Rotation allowed'}</div>
          </div>
          <div class="hd-r">
            ${co ? `<div class="hd-co">${esc(co)}</div>` : ''}
            ${jr ? `<div class="hd-m">Job: ${esc(jr)}</div>` : ''}
            <div class="hd-m">${dateStr}</div>
          </div>
        </header>

        <div class="drawwrap">
          <!-- Y dimension down the left edge -->
          <div class="dim-y" style="height:${dh}px"><span>${sh.sheetH}mm</span></div>
          <div class="sheet" style="width:${dw}px;height:${dh}px">
            ${rects}${cutMarks}
            ${(sh.offcut && sh.offcut.w > 0 && sh.offcut.h > 0) ? `<div class="offcut ${sh.usableOffcut ? 'keep' : ''}"
              style="left:${sh.offcut.x*scale}px;top:${sh.offcut.y*scale}px;width:${sh.offcut.w*scale}px;height:${sh.offcut.h*scale}px">
              ${(sh.offcut.w*scale > 90 && sh.offcut.h*scale > 18)
                ? `<span>${sh.usableOffcut ? '\u2713 KEEP OFFCUT' : 'Offcut'} ${Math.round(sh.offcut.w)}&times;${Math.round(sh.offcut.h)}</span>` : ''}
            </div>` : ''}
            <div class="datum"></div>
            <div class="datum-lab">0,0 datum</div>
            <div class="axis-x">X &rarr;</div>
            <div class="axis-y">Y &darr;</div>
          </div>
        </div>
        <!-- X dimension under the sheet -->
        <div class="dim-x" style="width:${dw}px">
          <span>${sh.sheetW}mm</span>
        </div>

        <div class="tables">
          <div class="tbl-col">
            <h3>Parts on this sheet (${parts.length}) \u2014 cut top-left first</h3>
            <div class="tbl-split">${partTables}</div>
          </div>
          <div class="tbl-col">
            <h3>Cut sequence${cuts && cuts.length ? ' \u2014 ' + cuts.length + ' cuts, in order' : ''}</h3>
            <div class="tbl-split">${cutTables}</div>
          </div>
        </div>
        <div class="note">X / Y = distance from the datum corner to each part's top-left corner, in mm.${
          cuts && cuts.length ? ` Every cut runs edge to edge across the piece you are holding; measure "At" from the datum edge. The ${KERF}mm kerf is already allowed for.` : ''}</div>
        <footer class="ft">CutNest \u00b7 cutnest.co.uk &nbsp;\u00b7&nbsp; Verify against the physical sheet before cutting.</footer>
      </section>`;
    });
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Cut sheets${jr ? ' \u2014 ' + esc(jr) : ''}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#10202a;margin:0;background:#fff}
  .page{page-break-after:always;break-after:page;padding:6px 0 0}
  .page:last-child{page-break-after:auto;break-after:auto}
  .hd{border-bottom:2px solid #0f4c5c;padding-bottom:6px;margin-bottom:10px;overflow:hidden}
  .hd > div:first-child{float:left;max-width:68%}
  .hd > .hd-r{float:right}
  .hd-t{font-size:17px;font-weight:800;color:#0f4c5c}
  .hd-m{font-size:11px;color:#4a6a76;margin-top:2px}
  .hd-r{text-align:right}
  .hd-co{font-size:13px;font-weight:700;color:#0f4c5c}
  .drawwrap{margin-left:6px;font-size:0}
  .drawwrap > *{display:inline-block;vertical-align:top}
  .sheet{position:relative;border:2px solid #0f4c5c;background:#fbfdfe}
  .pt{position:absolute;border:1.2px solid #0f4c5c;background:#e8f4f8;overflow:hidden;
      display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15}
  .pt-no{position:absolute;top:1px;left:3px;font-size:9px;font-weight:800;color:#0f4c5c;opacity:.75}
  .pt-dim{font-size:11px;font-weight:800;color:#0f4c5c}
  .pt-lab{font-size:9px;color:#4a6a76;max-width:96%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .pt-rot{font-size:8px;color:#b45309;font-weight:700}
  .cut{position:absolute}
  .cut-v{width:0;border-left:1.4px dashed #dc2626}
  .cut-h{height:0;border-top:1.4px dashed #dc2626}
  .cut-no{position:absolute;background:#dc2626;color:#fff;font-size:8px;font-weight:800;
          border-radius:7px;padding:0 4px;line-height:12px;height:12px}
  .cut-v .cut-no{left:-7px;top:-6px}
  .cut-h .cut-no{top:-7px;left:-6px}
  .offcut{position:absolute;border:1.2px dashed #9dbac4;background:repeating-linear-gradient(45deg,transparent,transparent 5px,#f2f7f9 5px,#f2f7f9 10px);
          display:flex;align-items:center;justify-content:center}
  .offcut.keep{border-color:#059669;background:repeating-linear-gradient(45deg,transparent,transparent 5px,#e7f7f0 5px,#e7f7f0 10px)}
  .offcut span{font-size:9px;font-weight:700;color:#6a8a96}
  .offcut.keep span{color:#047857}
  .datum{position:absolute;left:-1px;top:-1px;width:15px;height:15px;border-left:3px solid #b45309;border-top:3px solid #b45309}
  .datum-lab{position:absolute;left:18px;top:1px;font-size:8px;font-weight:800;color:#b45309}
  .axis-x{position:absolute;left:2px;bottom:-14px;font-size:9px;color:#b45309;font-weight:700}
  .axis-y{position:absolute;left:-16px;top:18px;font-size:9px;color:#b45309;font-weight:700}
  .dim-y{width:26px;border-right:1px solid #9dbac4;text-align:center;position:relative}
  .dim-y span{position:absolute;top:45%;left:-14px;width:54px;transform:rotate(-90deg);white-space:nowrap;font-size:10px;font-weight:700;color:#4a6a76}
  .dim-x{margin:4px 0 0 40px;border-top:1px solid #9dbac4;text-align:center;font-size:10px;font-weight:700;color:#4a6a76;padding-top:2px}
  .tables{margin-top:10px;font-size:0}
  .tbl-col{display:inline-block;vertical-align:top;width:49%;font-size:10px}
  .tbl-col + .tbl-col{margin-left:2%}
  .tbl-split{font-size:0}
  .tbl-split table{display:inline-table;vertical-align:top;margin-right:1%}
  h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#0f4c5c;margin:0 0 4px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  .tbl-split table{width:49%}
  .tbl-split table:only-child{width:100%}
  th{background:#0f4c5c;color:#fff;text-align:left;padding:3px 5px;font-weight:700}
  td{padding:2px 5px;border-bottom:1px solid #e2ecef}
  td.c{text-align:center}
  .nocut{color:#7a5b1a;background:#fffbeb;padding:6px}
  .note{font-size:9px;color:#6a8a96;margin-top:4px;line-height:1.4}
  .ft{margin-top:8px;border-top:1px solid #e2ecef;padding-top:4px;font-size:9px;color:#9dbac4;text-align:center}
  @media print{ body{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style></head><body>${pages}</body></html>`;
}

function exportCutSheets() {
  if (!calcResult) { showToast('Calculate a job first'); return; }
  const html = buildCutSheetsHtml();
  if (!html) { showToast('Nothing to print yet'); return; }
  const w = window.open('', '_blank');
  if (!w) {
    // Popup blocked (common on mobile): fall back to a blob the user can open.
    try {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.click();
      showToast('Cut sheets opened in a new tab \u2014 use your browser\u2019s Print / Save as PDF');
    } catch (e) {
      showToast('Your browser blocked the window \u2014 allow pop-ups for cutnest.co.uk');
    }
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(function () { w.print(); }, 700);
}


// ── OPEN-SHEETS PACKER (Best-Fit-Decreasing) ──────────────────
// The greedy pipeline fills sheet 1 as full as it can, then starts sheet 2.
// In bin-packing terms that is close to Next-Fit, and measurement showed it is
// where the remaining waste lives — NOT in the per-sheet placement rule, which
// is saturated (adding four more placement heuristics to it changed the total
// by less than 0.2%).
//
// This packer keeps EVERY sheet open and drops each piece wherever it seats
// best across all of them, opening a new sheet only when nothing fits. Measured
// over ~800 randomised free-placement jobs it uses 2.6-3.6% fewer sheets and
// hits the provable optimum on 72-74% of jobs vs 65-68% for the greedy loop —
// and it runs faster.
//
// The geometry is byte-for-byte the shipped maxRectsPack: same kerf-safe fit
// test, same full kerf moat on split, same free-rect pruning. ONLY the
// decomposition changes, so every packing invariant carries over unchanged.


// Verdict for one material. Only claims optimality when it can actually be
// proved: a single stock size, no remnant in play, and every piece placed.
function optimalityVerdict(res) {
  try {
    if (!res || !res.sheets) return null;
    if (res.unplaced && res.unplaced.length) return null;
    if (res.oversized && res.oversized.length) return null;
    if (res.sheets.some(function(s){ return s.isRemnant; })) return null;
    const keys = Object.keys(res.sizeMap || {});
    if (keys.length !== 1) return null;          // mixed sizes: bound not comparable
    const sheets = res.sheets;
    if (!sheets.length) return null;
    const W = sheets[0].sheetW, H = sheets[0].sheetH;
    const queue = [];
    sheets.forEach(function(sh){ sh.placed.forEach(function(p){ queue.push({w:p.w, h:p.h}); }); });
    if (!queue.length || queue.length > 400) return null;   // keep it cheap
    const lb = packingLowerBound(queue, W, H, KERF, res.allowRotation !== false);
    return { used: sheets.length, floor: lb, optimal: sheets.length <= lb };
  } catch (e) { return null; }
}


// ── FREE-PLAN LIMITS ─────────────────────────
// Grain lock and guillotine mode are Pro: a free calculation uses free
// placement with rotation allowed. Prices are still shown, but the engine
// only picks sheet sizes by price for Pro (withoutPrices strips them from the
// copy handed to the packer).
function freeTierMat(libMat) {
  return Object.assign({}, libMat, {
    allowRotation: true, cuttingMethod: 'free',
    sizes: stockSizes(libMat).slice(0, FREE_SHEET_SIZES).map(function(z){ return Object.assign({}, z, { max: null }); })
  });
}
function withoutPrices(libMat) {
  return Object.assign({}, libMat, {
    sizes: stockSizes(libMat).map(function(z){ return Object.assign({}, z, { price: 0 }); })
  });
}
// What a free calculation of this material leaves out, in the user's words.
function gatedFeatures(libMat, m) {
  const out = [];
  if (libMat.allowRotation === false) out.push('grain lock');
  if (libMat.cuttingMethod === 'guillotine') out.push('guillotine mode');
  if (m && m.remnant && m.remnant.w && m.remnant.h) out.push('your remnant');
  const sizes = stockSizes(libMat);
  if (sizes.length > FREE_SHEET_SIZES) out.push('sheet sizes after the first ' + FREE_SHEET_SIZES);
  if (sizes.some(function(z){ return z.max != null; })) out.push('stock limits');
  const used = sizes.slice(0, FREE_SHEET_SIZES);
  if (used.length > 1 && used.every(function(s){ return +s.price > 0; })) out.push('cost-optimised sheet choice');
  return out;
}
function gatedNoticeHtml(gated) {
  if (!gated || !gated.length) return '';
  const list = gated.length > 1 ? gated.slice(0, -1).join(', ') + ' and ' + gated[gated.length - 1] : gated[0];
  return `<div style="background:#fffbeb;border:1px solid var(--amber);border-radius:7px;padding:7px 10px;margin-bottom:7px;font-size:11.5px;color:#92400e;line-height:1.5">
    <b>Free plan:</b> calculated without ${esc(list)}.${gated.indexOf('grain lock') !== -1 ? ' <b>Pieces may be rotated against the grain.</b>' : ''}
    <a href="${LS_URL}" target="_blank" rel="noopener" style="color:var(--teal);font-weight:700;white-space:nowrap">Unlock with Pro &rarr;</a>
  </div>`;
}

// ── CALCULATE ─────────────────────────────────
// Ctrl+Enter and the stale banner's Recalculate button both call calculate()
// directly, so disabling the Calculate button alone did not stop a second run
// starting while the first was still packing.
let _calcBusy = false;
function calculate() {
  if (_calcBusy) return;
  _calcBusy = true;
  document.getElementById('err-box').style.display='none';
  document.getElementById('output').style.display='none';
  const overlay = document.getElementById('calc-overlay');
  if (overlay) overlay.classList.remove('hidden');
  const btn = document.getElementById('calc-btn');
  if (btn) btn.disabled = true;

  // Let the browser actually paint the overlay before we run the (synchronous,
  // CPU-heavy) pack. A double requestAnimationFrame guarantees one full paint
  // has happened; we fall back to setTimeout where rAF isn't available.
  // Big jobs can take a while on a phone. Offer Cancel after a few seconds and
  // say what is happening after fifteen, instead of an unexplained spinner.
  _calcCancelled = false;
  const subEl = document.getElementById('calc-overlay-sub');
  const cancelEl = document.getElementById('calc-cancel');
  const subDefault = 'Finding the most cost-effective arrangement';
  if (subEl) subEl.textContent = subDefault;
  if (cancelEl) cancelEl.style.display = 'none';
  const tCancel = setTimeout(function(){ if (cancelEl) cancelEl.style.display = 'inline-block'; }, 3000);
  const tSlow = setTimeout(function(){ if (subEl) subEl.textContent = 'Large job \u2014 still working. You can cancel and split it into smaller jobs.'; }, 15000);

  const runWork = async function() {
    try {
      await _doCalculate();
    } catch (e) {
      showErr('Something went wrong while calculating. Please try again.');
    } finally {
      clearTimeout(tCancel); clearTimeout(tSlow);
      if (cancelEl) cancelEl.style.display = 'none';
      if (subEl) subEl.textContent = subDefault;
      if (overlay) overlay.classList.add('hidden');
      if (btn) btn.disabled = false;
      _calcBusy = false;
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(runWork, 0); }); });
  } else {
    setTimeout(runWork, 30);
  }
}


// ── PACKING WORKER ────────────────────────────────────────────
// Packing is CPU-bound and was running on the main thread, so a 300-part job
// froze the tab for ~1s on a desktop and 4-8s on a phone — the spinner was
// painted but nothing else could happen, including scrolling.
//
// The worker (js/pack-worker.js) loads the same js/engine.js as this page, so
// the worker and the main thread execute THE SAME SOURCE.
//
// If there is no Worker support, or the worker fails to load or throws, the
// job runs on the main thread instead. A slow job is handled by the Cancel
// button, not by a timeout.
let _packWorker = null, _packWorkerDead = false, _packSeq = 0, _calcCancelled = false;
const _packPending = new Map();

// Stop a running calculation. The worker is thrown away (a fresh one is built
// on the next Calculate); anything waiting on it resolves as cancelled.
function cancelCalculation() {
  _calcCancelled = true;
  try { if (_packWorker) _packWorker.terminate(); } catch (e) {}
  _packWorker = null;
  _packPending.forEach(function (p) { clearTimeout(p.timer); p.ok({ res: null, err: null, cancelled: true }); });
  _packPending.clear();
}

function _killPackWorker() {
  try { if (_packWorker) _packWorker.terminate(); } catch (e) {}
  _packWorker = null;
  _packWorkerDead = true;                 // don't keep retrying a broken worker
  _packPending.forEach(function (p) { clearTimeout(p.timer); p.fail(); });
  _packPending.clear();
}

function getPackWorker() {
  if (_packWorkerDead) return null;
  if (_packWorker) return _packWorker;
  try {
    if (typeof Worker !== 'function') { _packWorkerDead = true; return null; }
    _packWorker = new Worker('/js/pack-worker.js');
    _packWorker.onmessage = function (ev) {
      const p = _packPending.get(ev.data && ev.data.id);
      if (!p) return;
      _packPending.delete(ev.data.id);
      clearTimeout(p.timer);
      p.ok(ev.data);
    };
    _packWorker.onerror = function () { _killPackWorker(); };
    return _packWorker;
  } catch (e) { _packWorkerDead = true; return null; }
}

// Warm the worker up during idle time so the first calculate doesn't pay for
// loading and compiling the engine.
function warmPackWorker() {
  try { getPackWorker(); } catch (e) {}
}

// Pack one material. Always resolves — never rejects — with {res, err}.
function packMaterial(libMat, pieces, remnant, jobQty) {
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (v) { if (!settled) { settled = true; resolve(v); } };
    const runOnMainThread = function () {
      try { done({ res: packJob(libMat, pieces, remnant, jobQty), err: null }); }
      catch (ex1) {
        try { done({ res: packJob(libMat, pieces, remnant, jobQty, true), err: null, fallback: true }); }
        catch (ex2) { done({ res: null, err: String((ex1 && ex1.message) || ex1) }); }
      }
    };

    const w = getPackWorker();
    if (!w) return runOnMainThread();

    const id = ++_packSeq;
    // No timeout fallback to the main thread any more: a slow job re-run on the
    // main thread froze the tab for longer than the worker would have taken.
    // Long jobs now show a Cancel button instead (see calculate()).
    const timer = null;

    _packPending.set(id, { timer: timer, ok: done, fail: runOnMainThread });
    try {
      w.postMessage({ id: id, kerf: KERF, settings: settings, libMat: libMat,
                      pieces: pieces, remnant: remnant, jobQty: jobQty });
    } catch (e) {
      clearTimeout(timer); _packPending.delete(id);
      _killPackWorker(); runOnMainThread();
    }
  });
}

async function _doCalculate() {
  const jobQtyEl = document.getElementById('job-qty');
  const jobQty = isPro ? Math.max(1, Math.min(999, parseInt(jobQtyEl ? jobQtyEl.value : '1') || 1)) : 1;
  const unitsEl = document.getElementById('units-badge');
  if (unitsEl) unitsEl.textContent = jobQty > 1 ? '×' + jobQty + ' units' : '';
  document.getElementById('err-box').style.display='none';
  document.getElementById('output').style.display='none';

  const errors = [];
  const results = [];

  // Free plan = 1 material per job. Enforced here as well as on import so no
  // future entry point can bypass it.
  const activeMats = isPro ? mats : mats.slice(0, 1);
  if (!isPro && mats.length > 1) {
    errors.push('Free plan calculates 1 material per job — showing the first. Upgrade to Pro to nest all ' + mats.length + ' together.');
  }

  for (const m of activeMats) {
    const storedMat = library.find(l => l.id == m.selectedMatId);
    if (!storedMat) { errors.push(`Material ${mats.indexOf(m)+1}: Please select a material.`); continue; }
    // Free plan: grain lock, guillotine mode, remnants and cost-optimised sheet
    // choice are Pro. The material keeps its settings (they come back on
    // upgrade); the free calculation just runs without them and says so.
    const libMat = isPro ? storedMat : freeTierMat(storedMat);
    const gated = isPro ? [] : gatedFeatures(storedMat, m);
    const valid = m.pieces.filter(p=>p.w>0&&p.h>0&&p.qty>0);
    if (!valid.length) { errors.push(`Material ${mats.indexOf(m)+1} (${esc(libMat.name)}): Please add at least one piece.`); continue; }

    // check pieces fit — only against sizes that have real positive dimensions
    const sizes = stockSizes(libMat);   // already cut to the free plan's sizes when not Pro

    if (!sizes.length) {
      errors.push(`${esc(libMat.name)}: no valid sheet size set. Open Library → Edit ${esc(libMat.name)} and add a sheet size.`);
      continue;
    }
    // ── OVERSIZED PIECES ──
    // Previously ONE piece that could not fit made the whole material `continue`,
    // so the material vanished from the results entirely: no card, no sheet
    // count, no cost, no layout, and nothing in CSV/PDF either — just a red
    // banner that is easy to scroll past. Now the pieces that DO fit are packed
    // and reported as normal, and the offenders are carried through as
    // `oversized` so every surface can show a per-material "not placed" block.
    const allowRot = libMat.allowRotation !== false;
    const fitting = [], oversized = [];
    for (const p of valid) {
      const pw = +p.w, ph = +p.h;
      const fits = sizes.some(function(sz){
        const sw = +sz.w, sh = +sz.h;
        // Only count the rotated orientation if this material actually permits
        // rotation (e.g. brushed stainless / grain-direction timber do not).
        return (pw<=sw && ph<=sh) || (allowRot && ph<=sw && pw<=sh);
      });
      if (fits) { fitting.push(p); continue; }
      // Would it have fitted if rotation were allowed? That is a different fix
      // for the user (unlock the grain) than "buy a bigger sheet".
      const fitsRotated = !allowRot && sizes.some(function(sz){ return ph<=+sz.w && pw<=+sz.h; });
      oversized.push({
        w: pw, h: ph, qty: (+p.qty||1), label: p.label || '',
        reason: fitsRotated ? 'grain-locked' : 'too-big',
        minSheet: minSheetFor(pw, ph, allowRot)
      });
      const sizeStr = sizes.map(function(s){return (+s.w)+'×'+(+s.h)+'mm';}).join(' or ');
      errors.push(fitsRotated
        ? `${esc(libMat.name)}: "${esc(p.label||pw+'×'+ph)}" (${pw}×${ph}mm) only fits rotated, but grain is locked for this material.`
        : `${esc(libMat.name)}: "${esc(p.label||pw+'×'+ph)}" (${pw}×${ph}mm) is too big for the ${sizeStr} sheet.`);
    }

    // Nothing fits at all: still emit a result so the material keeps its card
    // and its "not placed" block, instead of disappearing.
    if (!fitting.length) {
      results.push({ libMat, sheets: [], unplaced: [], sizeMap: {}, oversized, gated });
      continue;
    }

    // Off the main thread where possible. packMaterial never rejects: it
    // handles the runMat -> runMatSafe fallback internally, in whichever thread
    // it ends up running in, so the error semantics here are unchanged.
    const packed = await packMaterial(isPro ? libMat : withoutPrices(libMat), fitting, isPro ? m.remnant : null, jobQty);
    if (packed.cancelled || _calcCancelled) {
      // Leave the previous results exactly as they were.
      if (calcResult) document.getElementById('output').style.display = 'block';
      showToast('Calculation cancelled');
      return;
    }
    let res = packed.res;
    if (packed.err) {
      errors.push(`${esc(libMat.name)}: could not calculate (${esc(packed.err)}).`);
      continue;
    }
    if (!res || res.noValidSize) {
      errors.push(`${esc(libMat.name)}: no valid sheet size. Open Library → Edit ${esc(libMat.name)} and set Size 1.`);
      continue;
    }
    res.oversized = oversized;
    // Every piece here already passed the fit gate above, so zero sheets means a
    // genuine packing failure, not an oversized part. Keep the material in the
    // results (so its card and "not placed" block still render) and flag it.
    if (res.sheets.length === 0) {
      if (!res.stockShort) {
        const list = sizes.map(function(z){ return z.w + '×' + z.h; }).join(' / ');
        errors.push(`${esc(libMat.name)}: packing returned nothing for pieces that should fit. Sheets: ${list}. [This is a bug — please email hello@cutnest.co.uk]`);
      }
    }
    results.push({ libMat, ...res, gated });
  }

  // A job that blows the 150-sheet ceiling reports its overflow as "unplaced",
  // which previously rendered as "check dimensions are smaller than your sheet
  // sizes" — the wrong diagnosis entirely. Name the real cause.
  results.forEach(function(r){
    if (r.unplaced && r.unplaced.length && r.sheets.filter(function(s){return !s.isRemnant;}).length >= 150) {
      errors.push(`${esc(r.libMat.name)}: this job needs more than 150 sheets. Split it into smaller jobs — the remaining pieces are listed as not placed.`);
    }
  });

  if (errors.length && !results.length) { showErr(errors.join(' | ')); return; }
  if (errors.length) {
    // Some materials worked, some didn't — show the working results AND the warnings.
    showErr('Some materials need attention: ' + errors.join(' | '));
  }
  calcResult = { results };
  // The results now match the pieces, so the "pieces changed" banner goes.
  const staleEl = document.getElementById('stale-banner');
  if (staleEl) staleEl.style.display = 'none';
  saveToHistory();
  renderOutput();
}

function showErr(msg) {
  const b = document.getElementById('err-box');
  if (!b) return;
  let hint = '';
  if (msg.indexOf('larger than') > -1 || msg.indexOf('exceed') > -1 || msg.indexOf('too big') > -1) {
    hint = '<div style="margin-top:7px;font-size:12px;color:var(--text2)">Tip: check piece dimensions are in mm and sheet sizes are correct in Library.</div>';
  } else if (msg.indexOf('library') > -1 || msg.indexOf('material') > -1) {
    hint = '<div style="margin-top:7px;font-size:12px;color:var(--text2)">Tip: open Library and add at least one material with sheet sizes and prices before calculating.</div>';
  } else if (msg.indexOf('pieces') > -1 || msg.indexOf('empty') > -1) {
    hint = '<div style="margin-top:7px;font-size:12px;color:var(--text2)">Tip: enter at least one piece width, height and quantity before calculating.</div>';
  }
  b.innerHTML = msg + hint;
  b.style.display = 'block';
}

// ── NOT-PLACED REPORTING ──────────────────────────────────────
// A material can fail to place pieces two ways: a piece is bigger than any
// stock sheet (oversized — caught before packing), or the packer ran out of
// sheets (unplaced). Both used to surface as, at best, a small red line that is
// easy to miss, and an oversized piece removed the whole material from the
// results. These helpers give every surface — screen, CSV, PDF — one consistent,
// unmissable block naming each piece and the minimum sheet that would take it.
function groupUnplaced(unplaced){
  const by = {};
  (unplaced||[]).forEach(function(p){
    const k = (p.label||'') + '|' + p.w + '|' + p.h;
    if (!by[k]) by[k] = { label:p.label||'', w:p.w, h:p.h, qty:0 };
    by[k].qty++;
  });
  return Object.keys(by).map(function(k){ return by[k]; });
}

// Plain-text lines, used by CSV and PDF so an export can never hide a problem
// that the screen shows.
function notPlacedLines(libMat, unplaced, oversized, stockShort){
  const allowRot = libMat.allowRotation !== false;
  const out = [];
  (oversized||[]).forEach(function(o){
    const ms = o.minSheet || minSheetFor(o.w, o.h, allowRot);
    out.push({
      label: o.label || (o.w+'\u00d7'+o.h),
      w:o.w, h:o.h, qty:o.qty,
      why: o.reason === 'grain-locked'
        ? 'Only fits rotated, but grain is locked for this material'
        : 'Larger than every stock sheet size',
      fix: o.reason === 'grain-locked'
        ? ('Unlock grain in Library, or order a sheet at least ' + ms.w + '\u00d7' + ms.h + 'mm')
        : ('Order a sheet at least ' + ms.w + '\u00d7' + ms.h + 'mm')
    });
  });
  groupUnplaced(unplaced).forEach(function(u){
    out.push({
      label: u.label || (u.w+'\u00d7'+u.h),
      w:u.w, h:u.h, qty:u.qty,
      why: stockShort ? 'Not enough sheets in stock' : 'Packer ran out of sheets for this job',
      fix: stockShort ? 'Raise or clear "Max sheets" on a size in Library, or add another size'
                      : 'Split the job, or add another sheet size in Library'
    });
  });
  return out;
}

function notPlacedCount(unplaced, oversized){
  return (unplaced||[]).length +
         (oversized||[]).reduce(function(a,o){ return a + (+o.qty||1); }, 0);
}

// The on-screen block. Deliberately loud: red header bar, one row per piece.
function notPlacedHtml(libMat, unplaced, oversized, stockShort){
  const rows = notPlacedLines(libMat, unplaced, oversized, stockShort);
  if (!rows.length) return '';
  const n = notPlacedCount(unplaced, oversized);
  return `<div style="background:#fff5f5;border:2px solid var(--red);border-radius:11px;margin-top:14px;overflow:hidden">
    <div style="background:var(--red);color:#fff;padding:9px 13px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:.5px">
      ⚠ ${n} PIECE${n!==1?'S':''} NOT PLACED — ${esc(libMat.name)}
    </div>
    <div style="padding:11px 13px">
      ${rows.map(function(r){
        return `<div style="padding:7px 0;border-bottom:1px solid #fbdcdc">
          <div style="font-size:13px;font-weight:700;color:var(--red)">${esc(r.label)} — ${r.w}×${r.h}mm ×${r.qty}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(r.why)}</div>
          <div style="font-size:12px;color:var(--teal);font-weight:600;margin-top:2px">→ ${esc(r.fix)}</div>
        </div>`;
      }).join('')}
      <div style="font-size:11px;color:var(--muted);margin-top:9px">These pieces are NOT included in the sheet count or cost above.</div>
    </div>
  </div>`;
}

// ── RENDER OUTPUT ─────────────────────────────
function renderOutput() {
  document.getElementById('output').style.display='block';
  const {results} = calcResult;
  const quoteLines = [];
  // Registry of sheets for the Zoom modal. We pass an INDEX into this array
  // rather than JSON-stringifying the whole sheet into an onclick attribute,
  // which broke as soon as a sheet had pieces (JSON double-quotes terminated
  // the attribute) or a label contained a quote.
  window._zoomSheets = [];

  // Pricing cards
  document.getElementById('pricing-cards').innerHTML = results.map((_r) => {
    const {libMat, sheets, unplaced, sizeMap, oversized} = _r;
    const verdict = optimalityVerdict(_r);
    // A remnant is stock the user ALREADY OWNS. It must never be counted as a
    // sheet to buy or billed at the full sheet price — previously the headline
    // count and the total cost both included it while the size chips (built from
    // sizeMap) did not, so the same card showed two contradictory numbers and
    // the total over-charged by one sheet.
    const remnantSheets = sheets.filter(s => s.isRemnant);
    const total = boughtSheets(sheets).length;
    const chips = Object.entries(sizeMap).map(([dim,cnt]) => {
      const [sw, sh] = dim.split('×').map(Number);
      const matchedSize = sizeByDims(libMat, sw, sh);
      const unitPrice = matchedSize && matchedSize.price > 0 ? matchedSize.price : 0;
      const lineTotal = unitPrice * cnt;
      quoteLines.push(`${libMat.name}: ${cnt} sheet${cnt>1?'s':''} — ${dim}mm${unitPrice ? ' @ £'+unitPrice+' each' : ''}`);
      return `<div class="pres-size-chip"><b>${cnt}</b> × ${dim}mm${unitPrice ? `<span style="color:var(--green);margin-left:5px">£${lineTotal.toFixed(0)}</span>` : ''}</div>`;
    }).join('');

    // Per-material utilisation: how much of the stock this material consumed,
    // rounded to the nearest 10%. You still BUY (and handle) whole sheets — the
    // count and cost above are the real figures — but this tells you at a glance
    // how well the material was used. Area-weighted so big sheets count more.
    const matUsedArea = sheets.reduce((a,sh)=>a + sh.placed.reduce((aa,p)=>aa+p.w*p.h,0), 0);
    const matStockArea = sheets.reduce((a,sh)=>a + sh.sheetW*sh.sheetH, 0);
    const matUtil10 = matStockArea > 0 ? Math.round((matUsedArea/matStockArea)*100) : 0;
    const utilCol = matUtil10 >= 70 ? 'var(--green)' : matUtil10 >= 45 ? 'var(--yel)' : 'var(--red)';

    return `<div class="pres-card">
      <div class="pres-left">
        <div class="pres-name">${esc(libMat.name)}<span class="pres-thk">${esc(libMat.thickness||'')}</span></div>
        ${gatedNoticeHtml(_r.gated)}
        ${verdict ? (verdict.optimal
          ? `<div style="display:inline-flex;align-items:center;gap:5px;background:#d1fae5;border:1px solid #6ee7b7;color:#065f46;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;margin-bottom:7px" title="Checked against a mathematical lower bound: no arrangement of these parts can fit on fewer sheets.">✓ PROVABLY OPTIMAL — no nest can use fewer sheets</div>`
          : `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--sky);border:1px solid var(--bdr2);color:var(--muted);border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;margin-bottom:7px" title="The theoretical floor is a mathematical bound. It is often not physically achievable — a gap of one sheet usually means the bound is loose, not that a better nest exists.">Best nest found · theoretical floor ${verdict.floor} sheet${verdict.floor!==1?'s':''}</div>`) : ''}
        ${(function(){
          // If this material used a remnant that came from stock, that piece has
          // now been cut — offer to take it out so it is never offered twice.
          const _m = mats.find(function(x){ return x.selectedMatId == libMat.id && x.remnantFromStock; });
          if (!_m || !remnantSheets.length) return '';
          return `<div style="background:#fffbeb;border:1px solid var(--amber);border-radius:7px;padding:7px 10px;margin-bottom:7px;font-size:11.5px;color:#92400e;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>You cut a stock offcut on this job.</span>
            <button class="btn-sm-gr" onclick="retireUsedOffcut('${_m.id}')">Remove it from stock</button>
          </div>`;
        })()}
        ${_r.altFewerSheets ? `<div style="background:var(--sky);border:1px dashed var(--bdr2);border-radius:7px;padding:7px 10px;margin-bottom:7px;font-size:11.5px;color:var(--text2);line-height:1.5">
          <b style="color:var(--teal)">Fewer sheets available:</b> ${_r.altFewerSheets.sheets} sheet${_r.altFewerSheets.sheets!==1?'s':''}
          (${Object.entries(_r.altFewerSheets.sizeMap).map(([d,c])=>`${c}\u00d7 ${d}mm`).join(', ')}) for \u00a3${_r.altFewerSheets.cost.toFixed(2)}
          \u2014 \u00a3${_r.altFewerSheets.extraCost.toFixed(2)} more, but ${_r.altFewerSheets.savedSheets} less sheet${_r.altFewerSheets.savedSheets!==1?'s':''} to handle and set up.
        </div>` : ''}
        <div class="pres-sizes">${chips || '<span style="color:var(--red);font-size:13px">No pieces placed</span>'}${remnantSheets.map(r=>`<div class="pres-size-chip" style="background:#d1fae5;border-color:#6ee7b7;color:#065f46">＋ your remnant ${r.sheetW}×${r.sheetH}mm <b>£0</b></div>`).join('')}</div>
        ${notPlacedCount(unplaced, oversized) ? `<div class="pres-warn" style="background:var(--red);color:#fff;font-weight:700;border-radius:5px;padding:3px 8px;display:inline-block;margin-top:5px">⚠ ${notPlacedCount(unplaced, oversized)} piece(s) NOT placed — see below</div>` : ''}
      </div>
      <div class="pres-right">
        <div style="text-align:center">
          <div class="pres-count">${total}</div>
          <div class="pres-unit">sheet${total!==1?'s':''}</div>
          ${total ? `<div class="pres-util" style="font-size:11px;font-weight:700;color:${utilCol};margin-top:3px">${matUtil10}% used</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  // Total cost
  let grandTotal = 0;
  let allPriced = true;
  // Someone quoting 10 enclosures needs £ per enclosure; only the total existed.
  const jobQtyForCost = isPro
    ? Math.max(1, Math.min(999, parseInt((document.getElementById('job-qty')||{}).value) || 1))
    : 1;
  results.forEach(({libMat, sheets}) => {
    sheets.forEach(sh => {
      if (sh.isRemnant) return; // already owned — costs nothing
      const size = sizeByDims(libMat, sh.sheetW, sh.sheetH);
      if (size && size.price > 0) grandTotal += size.price;
      else allPriced = false;
    });
  });
  const tcBar = document.getElementById('total-cost-bar');
  const tcVal = document.getElementById('total-cost-val');
  const hintBar = document.getElementById('price-hint-bar');
  if (tcBar && tcVal && grandTotal > 0) {
    tcVal.innerHTML = '£' + grandTotal.toFixed(2) + (allPriced ? '' : '*')
      + (jobQtyForCost > 1
          ? '<div style="font-size:12px;font-weight:400;color:rgba(255,255,255,.75);margin-top:2px">£'
            + (grandTotal / jobQtyForCost).toFixed(2) + ' per unit × ' + jobQtyForCost + '</div>'
          : '');
    tcBar.style.display = 'flex';
    // Some sheets unpriced → show the hint as a "partial total" note too.
    if (hintBar) {
      if (!allPriced) {
        hintBar.querySelector('span').innerHTML = '&#128181; This total is <b>partial</b> — some materials have no sheet price set. Add them in Library for a complete cost.';
        hintBar.style.display = 'flex';
      } else { hintBar.style.display = 'none'; }
    }
  } else {
    // No prices at all: hide the cost bar but PROMPT rather than going silent.
    if (tcBar) tcBar.style.display = 'none';
    if (hintBar) {
      hintBar.querySelector('span').innerHTML = '&#128181; Add sheet prices in your Library to see this job&rsquo;s material cost.';
      hintBar.style.display = 'flex';
    }
  }

  // Say it plainly, in the words the user will type into a supplier email.
  // This text already existed inside _quoteText but was hidden behind a
  // "Copy for quote" button in the bottom corner.
  const orderEl = document.getElementById('order-line');
  const orderTxt = document.getElementById('order-line-text');
  if (orderEl && orderTxt) {
    const parts = [];
    results.forEach(function(r){
      Object.entries(r.sizeMap).forEach(function(e){
        parts.push(e[1] + ' × ' + e[0] + 'mm ' + r.libMat.name + (r.libMat.thickness ? ' ' + r.libMat.thickness : ''));
      });
    });
    if (parts.length) { orderTxt.textContent = parts.join('  ·  '); orderEl.style.display = 'block'; }
    else { orderEl.style.display = 'none'; }
  }

  window._quoteText = ['CutNest Cut List', 'Job: ' + ((document.getElementById('job-ref')||{}).value||'Untitled'), 'Date: ' + new Date().toLocaleDateString('en-GB'), ''].concat(quoteLines).concat(grandTotal > 0 ? ['', 'Total Material Cost: £' + grandTotal.toFixed(2)] : []).join('\n');

  // Stats
  // Kerf is hidden in the header on mobile, so the single most cost-affecting
  // assumption was invisible on a phone. State it on the results themselves.
  const ra = document.getElementById('results-assumptions');
  if (ra) ra.textContent = 'Calculated with a ' + KERF + 'mm blade kerf'
    + (results.some(r=>r.libMat.allowRotation===false) ? ' \u00b7 grain locked on some materials' : '');

  const totalSheets = results.reduce((s,r)=>s+boughtSheets(r.sheets).length,0);
  const totalPlaced = results.reduce((s,r)=>s+r.sheets.reduce((a,sh)=>a+sh.placed.length,0),0);
  const totalUnplaced = results.reduce((s,r)=>s+r.unplaced.length,0);
  // Area-weighted, matching the per-material card exactly. The old unweighted
  // mean of per-sheet percentages let one nearly-empty small sheet swing the
  // headline number away from the figure shown on the card right above it.
  const allUsedArea  = results.reduce((a,r)=>a + r.sheets.reduce((x,sh)=>x + sh.placed.reduce((y,p)=>y+p.w*p.h,0),0), 0);
  const allStockArea = results.reduce((a,r)=>a + r.sheets.reduce((x,sh)=>x + sh.sheetW*sh.sheetH,0), 0);
  const avgUtil = allStockArea > 0 ? Math.round((allUsedArea/allStockArea)*100) : 0;
  const reclaimable = results.reduce((s,r)=>s+r.sheets.filter(sh=>sh.usableOffcut).length,0);
  document.getElementById('s-sheets').textContent = totalSheets;
  document.getElementById('s-placed').textContent = totalPlaced;
  const su=document.getElementById('s-unplaced'); su.textContent=totalUnplaced; su.style.color=totalUnplaced>0?'var(--red)':'var(--green)';
  const sw=document.getElementById('s-waste');
  sw.textContent=avgUtil+'%';
  sw.style.color = avgUtil >= 70 ? 'var(--green)' : avgUtil >= 45 ? 'var(--yel)' : 'var(--red)';
  const swl=document.getElementById('s-waste-label');
  if(swl) swl.textContent='Avg Utilisation';
  const sr=document.getElementById('s-reclaim');
  if(sr) sr.textContent=reclaimable;

  // Build sheet navigation if multiple sheets
  const totalSheetsAll = results.reduce((s,r)=>s+r.sheets.length,0);
  if (totalSheetsAll > 3) {
    let navHtml = '<div class="sheet-nav no-print">';
    let sheetIdx = 0;
    results.forEach(({libMat, sheets}) => {
      sheets.forEach((sh, si) => {
        const id = 'sheet-anchor-' + sheetIdx;
        navHtml += `<button class="sheet-nav-btn" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth',block:'start'})">${esc(libMat.name.split(' ').slice(0,2).join(' '))} S${si+1}</button>`;
        sheetIdx++;
      });
    });
    navHtml += '</div>';
    const navEl = document.getElementById('sheet-nav-wrap');
    if (navEl) navEl.innerHTML = navHtml;
  } else {
    const navEl = document.getElementById('sheet-nav-wrap');
    if (navEl) navEl.innerHTML = '';
  }

  // Per-material visuals
  const visWrap = document.getElementById('mat-visuals');
  visWrap.innerHTML='';
  // Responsive: use container width for scaling
  const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
  const isNarrow = vw < 700;
  const containerW = visWrap.parentElement ? Math.min(visWrap.parentElement.offsetWidth - 32, 900) : 500;
  // The old 240px height cap and 700px container cap rendered a 2450x1150
  // sheet at roughly 1:11 — a postage stamp on the one screen with room to
  // check it, and label text under 7px on a phone. Size to the viewport.
  const MAX_W = isNarrow ? Math.max(260, containerW) : Math.max(420, containerW * 0.66);
  const MAX_H = isNarrow ? 300 : 420;

  let globalSheetIdx = 0;
  results.forEach(({libMat, sheets, unplaced, oversized, stockShort}) => {
    const sec = document.createElement('div');
    sec.className = 'detail-section';
    const buyCount = boughtSheets(sheets).length;
    const remCount = sheets.length - buyCount;
    let html = `<div class="ds-title"><div class="ds-bar"></div>${esc(libMat.name)} — ${buyCount} sheet${buyCount!==1?'s':''} to order${remCount?` + ${remCount} remnant`:''}`
      + `<span style="margin-left:auto;display:flex;gap:5px;flex-wrap:wrap">`
      + `<span class="mode-chip">${libMat.cuttingMethod==='guillotine'?'⊞ Guillotine':'⊡ Free placement'}</span>`
      + (libMat.allowRotation===false?'<span class="mode-chip grain-on">🔒 Grain locked</span>':'')
      + `<span class="mode-chip">Kerf ${KERF}mm</span>`
      + `</span></div>`;

    sheets.forEach((sh, si) => {
      const anchorId = 'sheet-anchor-' + globalSheetIdx++;
      const scale = Math.min(MAX_W/sh.sheetW, MAX_H/sh.sheetH, 0.35);
      const cw=Math.round(sh.sheetW*scale), ch=Math.round(sh.sheetH*scale);

      // Build placed piece rects
      const pieceRects = sh.placed.map(p=>{
        const col=COLORS[p.pieceIndex%COLORS.length];
        const show=p.w*scale>28&&p.h*scale>16;
        const px=Math.round(p.x*scale), py=Math.round(p.y*scale);
        const pw=Math.max(2,Math.round(p.w*scale)-1), ph=Math.max(2,Math.round(p.h*scale)-1);
        return `<div class="piece-rect" title="${esc(p.label||'P'+(p.pieceIndex+1))}: ${p.w}×${p.h}mm${p.rotated?' (rotated)':''}" style="left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;background:${col}d0;border:1.5px solid ${col};position:absolute;border-radius:2px">
          ${show?`<div class="plbl" style="font-size:${Math.min(11,pw/7)}px;line-height:1.2;padding:2px 3px">${esc(p.label||'P'+(p.pieceIndex+1))}${p.rotated?'<span style="font-size:.75em">↻</span>':''}<br><span style="font-weight:400;font-size:.8em;opacity:.8">${p.w}×${p.h}</span></div>`:''}
        </div>`;
      }).join('');

      // Usable offcut overlay (drawn behind pieces so pieces sit on top)
      let offcutRect = '';
      if (sh.usableOffcut) {
        const o = sh.usableOffcut;
        const ox=Math.round(o.x*scale), oy=Math.round(o.y*scale);
        const ow=Math.max(2,Math.round(o.w*scale)-1), oh=Math.max(2,Math.round(o.h*scale)-1);
        const oShow = ow>40 && oh>24;
        offcutRect = `<div title="Usable offcut: ${Math.round(o.w)}×${Math.round(o.h)}mm" style="position:absolute;left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;background:repeating-linear-gradient(45deg,rgba(5,150,105,.18),rgba(5,150,105,.18) 5px,rgba(5,150,105,.30) 5px,rgba(5,150,105,.30) 10px);border:1.5px dashed var(--green);border-radius:2px;display:flex;align-items:center;justify-content:center;text-align:center">
          ${oShow?`<div style="font-size:${Math.min(11,ow/9)}px;font-weight:700;color:#065f46;line-height:1.2">USABLE OFFCUT<br><span style="font-weight:600;font-size:.85em">${Math.round(o.w)}×${Math.round(o.h)}</span></div>`:''}
        </div>`;
      }

      const utilColor = sh.utilPercent >= 70 ? 'var(--green)' : sh.utilPercent >= 45 ? 'var(--yel)' : 'var(--red)';

      html += `<div class="sheet-vis" id="${anchorId}">
        <div class="sv-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>Sheet ${si+1}</span>
            <span style="color:var(--muted)">·</span>
            <span>${sh.sheetW}×${sh.sheetH}mm${sh.isRemnant?' <span style="color:var(--green);font-size:10px;background:#d1fae5;padding:1px 6px;border-radius:4px">REMNANT</span>':''}</span>
            <span style="color:var(--muted)">·</span>
            <span>${sh.placed.length} piece${sh.placed.length!==1?'s':''}</span>
          </div>
          <button onclick="openZoomByIndex(${(window._zoomSheets.push(sh) - 1)}, ${si+1})" style="background:var(--sky);border:1px solid var(--bdr2);border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit;transition:.15s" onmouseover="this.style.background='var(--sky2)'" onmouseout="this.style.background='var(--sky)'">⤢ Zoom</button>
        </div>
        <div class="util-bar">
          <div class="util-seg" style="flex:${sh.utilPercent};background:var(--teal)"></div>
          <div class="util-seg" style="flex:${sh.usablePercent};background:repeating-linear-gradient(45deg,#059669,#059669 4px,#10b981 4px,#10b981 8px)"></div>
          <div class="util-seg" style="flex:${sh.scrapPercent};background:#e2e8f0"></div>
        </div>
        <div class="util-key">
          <span class="util-k"><i style="background:var(--teal)"></i>Parts used <b style="color:${utilColor}">${sh.utilPercent}%</b></span>
          <span class="util-k"><i style="background:repeating-linear-gradient(45deg,#059669,#059669 3px,#10b981 3px,#10b981 6px)"></i>Usable offcut <b style="color:var(--green)">${sh.usablePercent}%</b>${sh.usableOffcut?` <span style="color:var(--muted);font-weight:400">(${Math.round(sh.usableOffcut.w)}×${Math.round(sh.usableOffcut.h)})</span>`:''}</span>
          <span class="util-k"><i style="background:#e2e8f0"></i>Scrap <b style="color:var(--text2)">${sh.scrapPercent}%</b></span>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex-shrink:0">
            <div class="sheet-canvas" style="width:${cw}px;height:${ch}px;position:relative">
              ${offcutRect}
              ${pieceRects}
            </div>
            <div style="margin-top:5px;font-size:10px;color:var(--muted);text-align:center">${sh.sheetW}×${sh.sheetH}mm &nbsp;·&nbsp; scale 1:${Math.round(1/scale)}</div>
          </div>
          <div style="flex:1;min-width:140px;max-width:280px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Pieces on this sheet</div>
            ${(function(){
              /* One row per PIECE meant a 40-part sheet was 40 rows of scroll on a
                 phone. Group identical parts into "12 x Front 600x400". */
              const g = {};
              sh.placed.forEach(function(p){
                const k = p.pieceIndex+'|'+p.w+'|'+p.h+'|'+(p.rotated?1:0);
                if(!g[k]) g[k] = {n:0, p:p};
                g[k].n++;
              });
              return Object.keys(g).map(function(k){
                const e = g[k], p = e.p;
                return `<div class="legend-item"><div class="ldot" style="background:${COLORS[p.pieceIndex%COLORS.length]}"></div><span style="font-size:12px">${e.n>1?`<b>${e.n}×</b> `:''}${esc(p.label||'P'+(p.pieceIndex+1))}</span><span style="color:var(--muted);font-size:11px;margin-left:auto">${p.w}×${p.h}mm${p.rotated?' ↻':''}</span></div>`;
              }).join('');
            })()}
            ${sh.usableOffcut?`<div class="legend-item" style="margin-top:6px;border-top:1px dashed var(--bdr);padding-top:6px"><div class="ldot" style="background:repeating-linear-gradient(45deg,#059669,#059669 3px,#10b981 3px,#10b981 6px)"></div><span style="font-size:12px;color:#065f46;font-weight:600">Reclaim offcut</span><span style="color:var(--muted);font-size:11px;margin-left:auto">${Math.round(sh.usableOffcut.w)}×${Math.round(sh.usableOffcut.h)}mm</span></div>`:''}
          </div>
        </div>
      </div>`;
    });

    html += notPlacedHtml(libMat, unplaced, oversized, stockShort);
    sec.innerHTML = html;
    visWrap.appendChild(sec);
  });

  // Full table
  let rows='';
  results.forEach(({libMat, sheets}) => {
    sheets.forEach((sh,si)=>{
      sh.placed.forEach(p=>{
        rows+=`<tr>
          <td style="font-weight:600;color:var(--navy);font-size:12px">${esc(libMat.name)}</td>
          <td style="color:var(--muted)">${si+1}</td>
          <td style="color:var(--muted);font-size:12px">${sh.sheetW}×${sh.sheetH}</td>
          <td><div style="display:flex;align-items:center;gap:5px"><div style="width:9px;height:9px;border-radius:2px;background:${COLORS[p.pieceIndex%COLORS.length]};flex-shrink:0"></div>${esc(p.label||'P'+(p.pieceIndex+1))}</div></td>
          <td style="color:var(--muted)">${p.w}</td><td style="color:var(--muted)">${p.h}</td>
          <td style="color:var(--muted)">${fmtMm(p.x)}</td><td style="color:var(--muted)">${fmtMm(p.y)}</td>
          <td style="color:${p.rotated?'var(--ora)':'var(--muted)'}">${p.rotated?'Yes ↻':'No'}</td>
        </tr>`;
      });
    });
  });
  document.getElementById('placement-body').innerHTML = rows;
  document.getElementById('output').scrollIntoView({behavior:'smooth', block:'start'});
}

// ── COPY & EXPORT ─────────────────────────────
// Positions are sums of part sizes and kerfs, so with decimal sizes or a 0.3mm
// kerf they pick up float noise (304.29999999999995). Show them to 0.1mm.
function fmtMm(v) { return Math.round(v * 10) / 10; }

function copyQuote() {
  navigator.clipboard.writeText(window._quoteText||'').then(()=>{
    const b=document.getElementById('copy-btn');
    b.textContent='✓ Copied!'; b.classList.add('copied');
    setTimeout(()=>{ b.textContent='Copy for quote'; b.classList.remove('copied'); },2000);
  });
}

function exportPDF() {
  if (!calcResult) return;
  // Build a clean print-optimised HTML page and open in new tab for browser PDF save
  const jr = (document.getElementById('job-ref')||{}).value || 'Untitled';
  const dt = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const co = (settings && settings.companyName) ? settings.companyName + '  ·  ' : '';

  let body = `<div class="hdr"><div class="hdr-logo">CutNest</div><div class="hdr-meta">${esc(co)}Job: ${esc(jr)}  ·  ${dt}  ·  Kerf: ${KERF}mm</div></div>`;

  // Summary table
  body += `<table class="sum-tbl"><thead><tr><th>Material</th><th>Sheets</th><th>Size</th><th>Cost</th></tr></thead><tbody>`;
  let grandTotal = 0;
  calcResult.results.forEach(({libMat, sheets, sizeMap}) => {
    Object.entries(sizeMap).forEach(([dim,cnt]) => {
      const [sw,sh] = dim.split('×').map(Number);
      const sz = sizeByDims(libMat, sw, sh);
      const lineTotal = sz && sz.price > 0 ? sz.price * cnt : 0;
      grandTotal += lineTotal;
      body += `<tr><td>${esc(libMat.name)} ${esc(libMat.thickness||'')}</td><td>${cnt}</td><td>${dim}mm</td><td>${lineTotal>0?'£'+lineTotal.toFixed(2):'—'}</td></tr>`;
    });
  });
  if (grandTotal > 0) body += `<tr class="total-row"><td colspan="3">Total Material Cost</td><td>£${grandTotal.toFixed(2)}</td></tr>`;
  body += `</tbody></table>`;

  // Sheet visuals per material
  calcResult.results.forEach((_r) => {
    const {libMat, sheets, unplaced, oversized} = _r;
    const _v = optimalityVerdict(_r);
    const pdfBuy = boughtSheets(sheets).length;
    const pdfRem = sheets.length - pdfBuy;
    body += `<div class="mat-sec"><div class="mat-hdr">${esc(libMat.name)} — ${pdfBuy} sheet${pdfBuy!==1?'s':''} to order${pdfRem?` + ${pdfRem} remnant`:''}</div>`;
    sheets.forEach((sh,si) => {
      const scale = Math.min(480/sh.sheetW, 200/sh.sheetH, 0.32);
      const cw=Math.round(sh.sheetW*scale), ch=Math.round(sh.sheetH*scale);
      body += `<div class="sh-block"><div class="sh-title">Sheet ${si+1} — ${sh.sheetW}×${sh.sheetH}mm${sh.isRemnant?' (YOUR REMNANT — not ordered)':''} · ${sh.placed.length} pieces · ${sh.utilPercent||0}% utilised${sh.usableOffcut?` · usable offcut ${Math.round(sh.usableOffcut.w)}×${Math.round(sh.usableOffcut.h)}mm`:''}</div>`;
      body += `<div class="sh-canvas" style="width:${cw}px;height:${ch}px;position:relative">`;
      if (sh.usableOffcut) {
        const o = sh.usableOffcut;
        const ox=Math.round(o.x*scale), oy=Math.round(o.y*scale);
        const ow=Math.max(2,Math.round(o.w*scale)-1), oh=Math.max(2,Math.round(o.h*scale)-1);
        body += `<div style="position:absolute;left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;background:repeating-linear-gradient(45deg,#d1fae5,#d1fae5 4px,#a7f3d0 4px,#a7f3d0 8px);border:1.5px dashed #059669;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center">${ow>40&&oh>22?`<div style="font-size:${Math.min(9,ow/10)}px;font-weight:700;color:#065f46;line-height:1.2">OFFCUT<br><span style="font-weight:600;font-size:.85em">${Math.round(o.w)}×${Math.round(o.h)}</span></div>`:''}</div>`;
      }
      sh.placed.forEach(p => {
        const col = COLORS[p.pieceIndex%COLORS.length];
        const px=Math.round(p.x*scale),py=Math.round(p.y*scale),pw=Math.max(2,Math.round(p.w*scale)-1),ph=Math.max(2,Math.round(p.h*scale)-1);
        const show = pw>24&&ph>14;
        body += `<div style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;background:${col}cc;border:1.5px solid ${col};border-radius:2px;overflow:hidden;box-sizing:border-box">`;
        if (show) body += `<div style="font-size:${Math.min(10,pw/7)}px;font-weight:700;color:#fff;padding:2px 3px;line-height:1.2;text-shadow:0 1px 2px rgba(0,0,0,.4)">${esc(p.label||'P'+(p.pieceIndex+1))}${p.rotated?'↻':''}<br><span style="font-weight:400;font-size:.8em;opacity:.85">${p.w}×${p.h}</span></div>`;
        body += `</div>`;
      });
      body += `</div></div>`;
    });
    if (_v && _v.optimal) body += `<div style="font-size:10px;color:#065f46;font-weight:700;padding:3px 0">✓ Provably optimal — no arrangement of these parts fits on fewer sheets.</div>`;
    const npRows = notPlacedLines(libMat, unplaced, oversized, _r.stockShort);
    if (npRows.length) {
      body += `<div class="np-box"><div class="np-hdr">⚠ ${notPlacedCount(unplaced, oversized)} piece(s) NOT placed — not included in the sheets or cost above</div>`;
      body += `<table class="sum-tbl" style="margin-bottom:0"><thead><tr><th>Part</th><th>Size</th><th>Qty</th><th>Why</th><th>What to do</th></tr></thead><tbody>`;
      npRows.forEach(function(r){
        body += `<tr><td>${esc(r.label)}</td><td>${r.w}×${r.h}mm</td><td>${r.qty}</td><td>${esc(r.why)}</td><td>${esc(r.fix)}</td></tr>`;
      });
      body += `</tbody></table></div>`;
    }
    body += `</div>`;
  });

  // Placement detail table
  body += `<div class="mat-sec"><div class="mat-hdr">Placement Detail</div><table class="sum-tbl"><thead><tr><th>Material</th><th>Sheet</th><th>Part</th><th>W</th><th>H</th><th>X</th><th>Y</th><th>Rotated</th></tr></thead><tbody>`;
  calcResult.results.forEach(({libMat,sheets}) => {
    sheets.forEach((sh,si) => {
      sh.placed.forEach(p => {
        body += `<tr><td>${esc(libMat.name)}</td><td>${si+1}</td><td>${esc(p.label||'P'+(p.pieceIndex+1))}</td><td>${p.w}</td><td>${p.h}</td><td>${fmtMm(p.x)}</td><td>${fmtMm(p.y)}</td><td>${p.rotated?'Yes':''}</td></tr>`;
      });
    });
  });
  body += `</tbody></table></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CutNest — ${esc(jr)}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#0d2d36;padding:20px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f4c5c;padding-bottom:10px;margin-bottom:18px}
    .hdr-logo{font-size:22px;font-weight:900;color:#0f4c5c;font-family:Arial Black,sans-serif}
    .hdr-meta{font-size:11px;color:#6a9aaa}
    .sum-tbl{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px}
    .sum-tbl th{background:#0a3a47;color:#fff;padding:6px 10px;text-align:left}
    .sum-tbl td{padding:5px 10px;border-bottom:1px solid #e2ecef}
    .sum-tbl tr:nth-child(even) td{background:#f0f7f9}
    .total-row td{font-weight:700;background:#fef3c7!important;color:#92400e}
    .mat-sec{margin-bottom:24px;break-inside:avoid}
    .mat-hdr{font-size:13px;font-weight:700;color:#0f4c5c;border-left:4px solid #f59e0b;padding:4px 10px;margin-bottom:10px;background:#f0f7f9}
    .sh-block{margin-bottom:14px;break-inside:avoid}
    .sh-title{font-size:10px;color:#6a9aaa;margin-bottom:6px;font-weight:600}
    .sh-canvas{border:2px solid #cde4ea;border-radius:3px;background:repeating-linear-gradient(-45deg,rgba(15,76,92,.04),rgba(15,76,92,.04) 1px,transparent 1px,transparent 8px)}
    .warn-row{color:#dc2626;font-size:11px;padding:6px 0}
    .np-box{border:2px solid #dc2626;border-radius:6px;margin:10px 0 14px;overflow:hidden;break-inside:avoid}
    .np-hdr{background:#dc2626;color:#fff;font-weight:700;font-size:11px;padding:6px 10px}
    .np-box .sum-tbl{margin:0}
    .np-box .sum-tbl th{background:#7f1d1d}
    @media print{body{padding:10px}.sh-block{break-inside:avoid}div{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${body}<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2ecef;font-size:10px;color:#9dcad6;text-align:center">Generated by CutNest — cutnest.co.uk</div></body></html>`;

  const w = window.open('','_blank');
  if (!w) {
    // Popup blocked (common on mobile). Fall back to a same-tab blob the user
    // can save/print, instead of silently doing nothing.
    try {
      const blob = new Blob([html], {type:'text/html'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.click();
      showToast('Print view opened in a new tab — use your browser\u2019s Print/Save as PDF');
    } catch(e) {
      showToast('Your browser blocked the print window — allow pop-ups for cutnest.co.uk and try again');
    }
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

function shareJob() {
  try {
    // Only share the JOB itself (selected materials + their sizes + pieces),
    // NOT the user's whole library — that keeps the URL short enough to send.
    const slimMats = mats.map(function(m){
      const libMat = library.find(function(l){return l.id == m.selectedMatId;});
      return {
        name: libMat ? libMat.name : '',
        cuttingMethod: libMat ? (libMat.cuttingMethod||'free') : 'free',
        allowRotation: libMat ? (libMat.allowRotation !== false) : true,
        sizes: libMat ? stockSizes(libMat) : [],
        pieces: m.pieces.filter(function(p){return p.w>0 && p.h>0;})
      };
    }).filter(function(m){return m.pieces.length;});

    if (!slimMats.length) { showToast('Add some pieces before sharing'); return; }

    const state = {
      v: 3,
      jobRef: (document.getElementById('job-ref')||{}).value||'',
      jobQty: (document.getElementById('job-qty')||{}).value||'1',
      mats: slimMats
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    const url = window.location.origin + window.location.pathname + '?job=' + encoded;

    // Web Share API (mobile) — best experience
    if (navigator.share) {
      navigator.share({ title: 'CutNest Job', text: 'Cut list job from CutNest', url: url })
        .catch(function(){ fallbackCopy(url); });
      return;
    }
    fallbackCopy(url);
  } catch(e) {
    showToast('Could not generate share link');
  }
}

function fallbackCopy(url) {
  // Try modern clipboard, fall back to a manual copy prompt if it fails
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(function(){ showToast('🔗 Job link copied to clipboard'); })
      .catch(function(){ showShareUrlModal(url); });
  } else {
    showShareUrlModal(url);
  }
}

function showShareUrlModal(url) {
  // Last-resort: show the link in a selectable box so the user can copy it manually
  const existing = document.getElementById('share-url-modal');
  if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'share-url-modal';
  m.className = 'overlay';
  m.style.display = 'flex';
  m.onclick = function(e){ if(e.target===m) m.remove(); };
  m.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:480px;width:92%;padding:20px">'
    + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:800;color:var(--teal);margin-bottom:6px">Share this job</div>'
    + '<div style="font-size:13px;color:var(--muted);margin-bottom:12px">Copy this link and send it. Whoever opens it gets this exact job loaded.</div>'
    + '<textarea readonly style="width:100%;height:80px;font-size:12px;padding:8px;border:1px solid var(--bdr2);border-radius:8px;resize:none;font-family:monospace" onclick="this.select()">' + url + '</textarea>'
    + '<div style="text-align:right;margin-top:12px"><button onclick="document.getElementById(\'share-url-modal\').remove()" style="background:var(--teal);color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:700;cursor:pointer;font-family:\'Barlow Condensed\',sans-serif">Done</button></div>'
    + '</div>';
  document.body.appendChild(m);
  const ta = m.querySelector('textarea');
  if (ta) { ta.focus(); ta.select(); }
}


function csvCell(v){
  // CSV-safe a single cell. Two problems this prevents:
  //  1) Field corruption: a value containing a comma/quote/newline (e.g. a
  //     material name like "Steel, 3mm") would otherwise shift every later
  //     column. RFC-4180: wrap in double quotes, double any internal quotes.
  //  2) Formula injection: a text value starting with = + - @ (or tab/CR) can
  //     execute as a formula when the file is opened in Excel/Sheets. Prefix
  //     such text with an apostrophe so it's treated as literal text.
  // Real numbers pass through untouched so coordinates/sizes stay clean.
  if (typeof v === 'number') return String(v);
  var c = (v===null||v===undefined) ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;
  if (/[",\n\r]/.test(c)) c = '"' + c.replace(/"/g,'""') + '"';
  return c;
}

function exportCSV() {
  if (!calcResult) return;
  let csvTotal = 0;
  const summaryRows = calcResult.results.flatMap(({libMat,sizeMap}) =>
    Object.entries(sizeMap).map(([dim,c]) => {
      const [sw,sh] = dim.split('×').map(Number);
      const sz = sizeByDims(libMat, sw, sh);
      const lineTotal = sz && sz.price > 0 ? sz.price * c : 0;
      csvTotal += lineTotal;
      return [`${c}x ${libMat.name} ${dim}mm`, lineTotal > 0 ? `£${lineTotal.toFixed(2)}` : ''];
    })
  );
  const rows = [
    [`CutNest — ${new Date().toLocaleDateString()}`],[`Job: ${(document.getElementById('job-ref')||{}).value||'Untitled'}`],[`Blade Kerf: ${KERF}mm`],[],
    ['SHEET USAGE SUMMARY'],['Material & Size','Cost'],
    ...summaryRows,
    ...(csvTotal > 0 ? [['TOTAL MATERIAL COST',`£${csvTotal.toFixed(2)}`]] : []),
    [],['PLACEMENT DETAIL'],
    ['Material','Sheet #','Sheet Size','Label','W','H','X','Y','Rotated'],
    ...calcResult.results.flatMap(({libMat,sheets})=>sheets.flatMap((sh,si)=>sh.placed.map(p=>[libMat.name,si+1,`${sh.sheetW}x${sh.sheetH}`+(sh.isRemnant?' (remnant)':''),p.label||`P${p.pieceIndex+1}`,p.w,p.h,fmtMm(p.x),fmtMm(p.y),p.rotated?'Yes':'No']))),
  ];
  // Every not-placed piece — oversized AND unplaced — with the reason and the
  // minimum sheet that would take it. An export must never hide a dropped piece.
  const npAll = calcResult.results.flatMap(({libMat,unplaced,oversized,stockShort}) =>
    notPlacedLines(libMat, unplaced, oversized, stockShort).map(r =>
      [libMat.name, r.label, r.w, r.h, r.qty, r.why, r.fix]));
  if(npAll.length){
    rows.push([],['*** PIECES NOT PLACED — NOT INCLUDED IN THE SHEETS OR COST ABOVE ***'],
      ['Material','Label','W','H','Qty','Why','What to do'],...npAll);
  }
  const jr = (document.getElementById('job-ref')||{}).value||'cutlist';
  const safe = jr.replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const a=document.createElement('a');
  // BOM + explicit charset: without these, Excel on Windows opens the file in the
  // local ANSI codepage and every £ becomes "Â£" and every × becomes "Ã—".
  const csvText = '\uFEFF' + rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  a.href=URL.createObjectURL(new Blob([csvText],{type:'text/csv;charset=utf-8'}));
  a.download=`cutnest-${safe}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

// ── DXF EXPORT (Pro) — machine-ready cut layout ───────────────────────────
// Emits a valid AutoCAD R2000 DXF: each sheet tiled left-to-right with its
// boundary on a SHEET layer, parts as closed polylines on a PARTS layer, and
// labels on a TEXT layer. Units are millimetres. The packer uses a top-left
// (Y-down) origin; DXF is bottom-left (Y-up), so each part's Y is flipped per
// sheet — a part at the top-left on screen lands at the top-left in CAD, not
// mirrored. Feeds straight into CNC/laser/router CAM.
function buildDXF(results) {
  // ── DXF R12 (AC1009) ──────────────────────────────────────────
  // Rewritten after a real-world failure: the previous output was R2000 with
  // LWPOLYLINE entities, bare LF line endings, no VPORT table and no drawing
  // extents. It passed a Python CAD library's audit, which is exactly why that
  // was not good enough — a library that repairs as it reads is not the same
  // as a Windows CAD viewer that rejects on the first violation.
  //
  // Three defects, all now fixed:
  //   1. LF line endings. ASCII DXF convention is CRLF; Windows-native readers
  //      are the strictest about it.
  //   2. LWPOLYLINE is an R13+ entity. R12 uses POLYLINE / VERTEX / SEQEND.
  //   3. No $EXTMIN/$EXTMAX and no VPORT table, so a reader has no idea where
  //      the drawing is or how to frame it — some open blank, some refuse.
  //
  // R12 is the lowest common denominator every CAD package, CAM post, laser
  // controller and viewer on earth reads, and closed rectangles plus text lose
  // absolutely nothing by being expressed in it.
  const n = function(v){ return (Math.round(v*1000)/1000).toString(); };
  const out = [];
  const push = function(){ for (let i=0;i<arguments.length;i++) out.push(arguments[i]); };

  // Track real drawing extents for the header.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const seen = function(x, y){
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };

  const body = [];
  const bpush = function(){ for (let i=0;i<arguments.length;i++) body.push(arguments[i]); };

  // Closed rectangle as an R12 POLYLINE. Group 66 = "vertices follow",
  // 70 = 1 (closed). Every vertex is its own entity, terminated by SEQEND.
  const rect = function(x, y, w, h, layer){
    bpush('0','POLYLINE','8',layer,'66','1','70','1',
          '10','0.0','20','0.0','30','0.0');
    const pts = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    pts.forEach(function(pt){
      seen(pt[0], pt[1]);
      bpush('0','VERTEX','8',layer,'10',n(pt[0]),'20',n(pt[1]),'30','0.0');
    });
    bpush('0','SEQEND','8',layer);
  };

  const txt = function(x, y, h, str, layer){
    seen(x, y);
    bpush('0','TEXT','8',layer,'10',n(x),'20',n(y),'30','0.0','40',n(h),
          '1',String(str).replace(/[\r\n]/g,' ').slice(0,240),'7','STANDARD');
  };

  // ── ENTITIES (built first so the extents are known for the header) ──
  let offsetX = 0;
  const GAP = 200;
  results.forEach(function(res){
    const matName = (res.libMat && res.libMat.name) || 'Material';
    (res.sheets||[]).forEach(function(sh, si){
      const SW = sh.sheetW, SH = sh.sheetH;
      rect(offsetX, 0, SW, SH, 'SHEET');
      txt(offsetX, -40, 30, matName + ' - Sheet ' + (si+1) + ' (' + SW + 'x' + SH + 'mm)', 'TEXT');
      sh.placed.forEach(function(p){
        // DXF Y runs up, screen Y runs down — flip so the drawing is the right
        // way up in CAD rather than mirrored.
        const dy = SH - p.y - p.h;
        rect(offsetX + p.x, dy, p.w, p.h, 'PARTS');
        const lbl = (p.label || (p.w+'x'+p.h)) + (p.rotated ? ' (R)' : '');
        const th = Math.max(8, Math.min(p.w, p.h) / 8);
        txt(offsetX + p.x + 5, dy + 5, th, lbl, 'TEXT');
      });
      offsetX += SW + GAP;
    });
  });
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  // ── HEADER ──
  push('0','SECTION','2','HEADER',
       '9','$ACADVER','1','AC1009',
       '9','$INSBASE','10','0.0','20','0.0','30','0.0',
       '9','$EXTMIN','10',n(minX),'20',n(minY),'30','0.0',
       '9','$EXTMAX','10',n(maxX),'20',n(maxY),'30','0.0',
       '9','$LIMMIN','10',n(minX),'20',n(minY),
       '9','$LIMMAX','10',n(maxX),'20',n(maxY),
       '9','$MEASUREMENT','70','1',     // 1 = metric
       '0','ENDSEC');

  // ── TABLES ──
  push('0','SECTION','2','TABLES');

  // VPORT tells the reader how to frame the drawing. Without it some viewers
  // open to an empty screen or refuse the file outright.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vh = Math.max(1, (maxY - minY) * 1.1);
  push('0','TABLE','2','VPORT','70','1',
       '0','VPORT','2','*ACTIVE','70','0',
       '10','0.0','20','0.0','11','1.0','21','1.0',
       '12',n(cx),'22',n(cy),
       '13','0.0','23','0.0','14','10.0','24','10.0','15','10.0','25','10.0',
       '16','0.0','26','0.0','36','1.0','17','0.0','27','0.0','37','0.0',
       '40',n(vh),'41','1.9','42','50.0','43','0.0','44','0.0',
       '50','0.0','51','0.0','71','0','72','100','73','1','74','3','75','0',
       '76','0','77','0','78','0',
       '0','ENDTAB');

  push('0','TABLE','2','LTYPE','70','1',
       '0','LTYPE','2','CONTINUOUS','70','64','3','Solid line','72','65','73','0','40','0.0',
       '0','ENDTAB');

  push('0','TABLE','2','LAYER','70','4');
  [['0',7],['SHEET',5],['PARTS',3],['TEXT',7]].forEach(function(L){
    push('0','LAYER','2',L[0],'70','0','62',String(L[1]),'6','CONTINUOUS');
  });
  push('0','ENDTAB');

  push('0','TABLE','2','STYLE','70','1',
       '0','STYLE','2','STANDARD','70','0','40','0.0','41','1.0','50','0.0',
       '71','0','42','2.5','3','txt','4','',
       '0','ENDTAB');

  push('0','ENDSEC');

  // Empty BLOCKS section — expected even when unused.
  push('0','SECTION','2','BLOCKS','0','ENDSEC');

  push('0','SECTION','2','ENTITIES');
  for (let i = 0; i < body.length; i++) push(body[i]);
  push('0','ENDSEC');
  push('0','EOF');

  // CRLF, per the ASCII DXF convention.
  return out.join('\r\n') + '\r\n';
}
function exportDXF() {
  if (!isPro) { showUpgradeModal('&#128208;','DXF Export','Pro exports a machine-ready DXF of your cut layout &mdash; drop it straight into your CNC, laser or router CAM. Real dimensions, every part on its own layer.'); return; }
  if (!calcResult || !calcResult.results) return;
  const dxf = buildDXF(calcResult.results);
  const jr = (document.getElementById('job-ref')||{}).value||'cutlist';
  const safe = jr.replace(/[^a-z0-9]/gi,'-').toLowerCase();
  // image/vnd.dxf is the registered type; some browsers save an unknown type
  // with a .txt suffix, which then will not open in any CAD package.
  const url = URL.createObjectURL(new Blob([dxf], {type:'image/vnd.dxf'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cutnest-${safe}-${new Date().toISOString().slice(0,10)}.dxf`;
  // Some browsers ignore .click() on an anchor that is not in the document.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

// ── LIBRARY MODAL ─────────────────────────────
function openLib() {
  pending=library.map(e=>({...e,sizes:(e.sizes||[]).map(z=>({...z}))}));
  _libOpen.clear();
  renderLibEntries();
  document.getElementById('lib-modal').style.display='flex';
}
function closeLib() { document.getElementById('lib-modal').style.display='none'; }
async function saveLibClose() {
  flushEditForms();
  // Explicit save: promote any transient (shared-link) materials to permanent
  // by dropping the flag, so saveData will now persist them.
  library = pending.map(e => {
    const c = normalizeLibEntry(e);
    delete c._transient;
    return c;
  });
  if (isPro) {
    // Any master grade the user removed from the list is recorded so loadLib
    // does not simply re-inject it on the next load. Restoring one (see the
    // "Hidden CutNest grades" strip) puts it back in the list, which clears it
    // from this set automatically on the next save.
    const present = {};
    library.forEach(function(e){ if (e && e.id != null) present[e.id] = 1; });
    setDeletedMasterIds(MASTER_LIBRARY.filter(function(m){ return !present[m.id]; }).map(function(m){ return m.id; }));
  }
  await persistLib(library);
  renderAll();
  closeLib();
  showToast('✓ Library saved — ' + library.length + ' material' + (library.length!==1?'s':''));
}
// True if this id belongs to a CutNest master grade (Pro pre-built library).
function isMasterId(id){ return MASTER_LIBRARY.some(function(m){ return m.id === id; }); }

// Put the CutNest default back for one master grade, discarding the user's edits
// to it. Only touches `pending`, so nothing is committed until Save Library.
function resetMasterEntry(id){
  const m = MASTER_LIBRARY.find(function(x){ return x.id === id; });
  if (!m) return;
  const i = pending.findIndex(function(x){ return x.id === id; });
  const copy = normalizeLibEntry(JSON.parse(JSON.stringify(m)));
  if (i === -1) pending.push(copy); else pending[i] = copy;
  renderLibEntries();
  showToast('↺ ' + m.name + ' reset to CutNest default');
}

// Bring back a master grade the user previously deleted.
function restoreMaster(id){ resetMasterEntry(id); }

// Markup for the "Hidden CutNest grades" strip: master grades that are not
// currently in `pending`, i.e. the user deleted them. Without this there is no
// route back once a grade is removed.
function hiddenMastersHtml(){
  if (!isPro) return '';
  const present = {};
  pending.forEach(function(e){ if (e && e.id != null) present[e.id] = 1; });
  const missing = MASTER_LIBRARY.filter(function(m){ return !present[m.id]; });
  if (!missing.length) return '';
  return `<div style="background:var(--sky);border:1px dashed var(--bdr2);border-radius:10px;padding:11px 13px;margin-bottom:8px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Hidden CutNest grades (${missing.length})</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${missing.map(function(m){
        return `<button class="btn-sm-bl" onclick="restoreMaster(${JSON.stringify(m.id)})">+ ${esc(m.name)}</button>`;
      }).join('')}
    </div>
  </div>`;
}

function renderLibEntries() {
  const wrap=document.getElementById('lib-entries');
  if(!pending.length){wrap.innerHTML='<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Your library is empty. Add your first material below — enter the sheet sizes and prices from your supplier.</p>'+hiddenMastersHtml();return;}
  // Ids are numbers for hand-made entries but strings for shared-link ones
  // ('shared-…'). Written bare into onclick, a string id became a JS expression
  // (shared - 1750… - 0) and threw, so those materials could not be edited or
  // deleted. JSON-quote, then escape for the attribute.
  wrap.innerHTML=pending.map(e=>{ const jid=esc(JSON.stringify(e.id)); return `
    <div class="lib-entry">
      <div class="le-hdr">
        <div><div class="le-name">${esc(e.name)}</div><div class="le-meta">${esc(e.material||'')}${e.thickness?' · '+esc(e.thickness):''}</div></div>
        <div style="display:flex;gap:7px;align-items:center">
          ${isMasterId(e.id) ? `<button class="btn-sm-bl" title="Restore the CutNest default for this grade" onclick="resetMasterEntry(${JSON.stringify(e.id)})">↺ Reset</button>` : ''}
          <button class="btn-sm-bl" onclick="toggleEdit(${jid})">Edit</button>
          <button class="btn-del" onclick="delPending(${jid})">✕</button>
        </div>
      </div>
      <div id="ev-${e.id}"${_libOpen.has(e.id) ? ' style="display:none"' : ''}>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${sizeBadgesHtml(e)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <span class="mode-chip">${e.cuttingMethod==='guillotine'?'⊞ Guillotine'+(isPro?'':' (Pro)'):'⊡ Free placement'}</span>
          ${e.allowRotation===false?'<span class="mode-chip grain-on">🔒 Grain locked'+(isPro?'':' (Pro)')+'</span>':''}
        </div>
      </div>
      <div id="ee-${e.id}" style="display:${_libOpen.has(e.id) ? 'block' : 'none'}">
        <div class="edit-basic mt8">
          <div class="edit-basic-grid">
            <div><label class="lbl">Name</label><input type="text" data-f="name" value="${esc(e.name)}" oninput="upd(${jid},'name',this.value)"/></div>
            <div><label class="lbl">Material</label><input type="text" data-f="material" value="${esc(e.material||'')}" oninput="upd(${jid},'material',this.value)"/></div>
            <div><label class="lbl">Thickness</label><input type="text" data-f="thickness" value="${esc(e.thickness||'')}" oninput="upd(${jid},'thickness',this.value)"/></div>
          </div>
        </div>
        ${sizeEditorHtml(e, jid)}
        <div class="cut-opts">
          <div class="cut-opt-box">
            <label class="lbl">Cutting Method
              <span class="kerf-tip-icon" tabindex="0" role="img" aria-label="Help: Free = pieces nested anywhere (CNC punch, laser, router, plasma). Guillotine = straight edge-to-edge cuts only (panel saw, guillotine shear)." data-tip="Free = pieces nested anywhere (CNC punch, laser, router, plasma). Guillotine = straight edge-to-edge cuts only (panel saw, guillotine shear).">?</span>
            </label>
            <select onchange="upd(${jid},'cuttingMethod',this.value)"${isPro ? '' : ' disabled'}>
              <option value="free" ${(e.cuttingMethod||'free')==='free'?'selected':''}>Free placement (punch / laser / router)</option>
              <option value="guillotine" ${e.cuttingMethod==='guillotine'?'selected':''}>Guillotine (saw / shear — straight cuts)</option>
            </select>
          </div>
          <div class="cut-opt-box">
            <label class="lbl">Grain Direction
              <span class="kerf-tip-icon" tabindex="0" role="img" aria-label="Help: Lock ON = pieces keep their orientation (brushed steel, wood grain, directional finishes). Lock OFF = pieces may rotate 90° to pack tighter." data-tip="Lock ON = pieces keep their orientation (brushed steel, wood grain, directional finishes). Lock OFF = pieces may rotate 90° to pack tighter.">?</span>
            </label>
            <label class="grain-toggle">
              <input type="checkbox" ${e.allowRotation===false?'checked':''} onchange="upd(${jid},'allowRotation',!this.checked)"${isPro ? '' : ' disabled'}/>
              <span>Lock grain — don't rotate pieces</span>
            </label>
          </div>
        </div>
        ${isPro ? '' : `<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid var(--amber);border-radius:7px;padding:7px 10px;margin-top:8px">&#128274; Guillotine mode and grain lock are Pro features. <button onclick="showUpgradeModal('&#128274;','Grain lock &amp; guillotine mode','Pro keeps grain direction on brushed, veneered and patterned sheet, and nests for saws and shears with a numbered edge-to-edge cut sequence.')" style="background:none;border:none;color:var(--teal);font-weight:700;cursor:pointer;padding:0;font-size:12px;text-decoration:underline;font-family:inherit">Upgrade</button></div>`}
        <div style="text-align:right;margin-top:9px"><button class="btn-sm-gr" onclick="toggleEdit(${jid})">✓ Done</button></div>
      </div>
    </div>`; }).join('') + hiddenMastersHtml();
}
// Which library entries have their edit form open, so adding or removing a
// sheet size (which re-renders the list) keeps the form open.
const _libOpen = new Set();

// "Size 1 · 2450 × 1150 mm · £105 · max 6" badges for the library and job views.
function sizeBadgesHtml(libMat) {
  const sizes = (libMat && libMat.sizes || []).filter(function(z){ return +z.w > 0 && +z.h > 0; });
  if (!sizes.length) return '<div class="sz-badge" style="border-color:var(--red)"><span class="sl" style="color:var(--red)">No sheet size</span><span class="sv" style="color:var(--red)">Add one in Library</span></div>';
  return sizes.map(function(z, i){
    const locked = !isPro && i >= FREE_SHEET_SIZES;
    const extra = [];
    if (+z.price > 0) extra.push('£' + (+z.price));
    if (z.max != null && z.max !== '') extra.push(isPro ? 'max ' + z.max : 'max ' + z.max + ' (Pro)');
    return '<div class="sz-badge"' + (locked ? ' style="opacity:.5" title="Pro: the free plan uses the first ' + FREE_SHEET_SIZES + ' sizes"' : '') + '>' +
      '<span class="sl">Size ' + (i + 1) + (extra.length ? ' · ' + esc(extra.join(' · ')) : '') + (locked ? ' · Pro' : '') + '</span>' +
      '<span class="sv">' + (+z.w) + ' × ' + (+z.h) + ' mm</span></div>';
  }).join('');
}

// One row per sheet size: width, height, price, and (Pro) how many are available.
function sizeEditorHtml(e, jid) {
  const sizes = e.sizes && e.sizes.length ? e.sizes : [{ w: '', h: '', price: '', max: null }];
  const rows = sizes.map(function(z, i){
    const locked = !isPro && i >= FREE_SHEET_SIZES;
    return `<div class="size-row" data-sz="${i}"${locked ? ' style="opacity:.55"' : ''}>
      <div class="size-no">${i + 1}</div>
      <div><label class="lbl">W (mm)</label><input type="number" data-f="w" value="${+z.w > 0 ? +z.w : ''}" min="1" aria-label="Size ${i + 1} width in mm" oninput="updSz(${jid},${i},'w',this.value)"/></div>
      <div><label class="lbl">H (mm)</label><input type="number" data-f="h" value="${+z.h > 0 ? +z.h : ''}" min="1" aria-label="Size ${i + 1} height in mm" oninput="updSz(${jid},${i},'h',this.value)"/></div>
      <div><label class="lbl">Price £</label><input type="number" data-f="price" value="${+z.price > 0 ? +z.price : ''}" min="0" step="0.01" placeholder="0" aria-label="Size ${i + 1} price" oninput="updSz(${jid},${i},'price',this.value)"/></div>
      <div><label class="lbl" title="How many sheets of this size you can use (what you have in stock, or what your supplier can send). Leave blank for no limit.">Max sheets</label><input type="number" data-f="max" value="${z.max != null && z.max !== '' ? z.max : ''}" min="1" placeholder="${isPro ? 'no limit' : 'Pro'}" aria-label="Size ${i + 1} maximum sheets available" oninput="updSz(${jid},${i},'max',this.value)"${isPro ? '' : ' disabled'}/></div>
      <button type="button" class="btn-del" onclick="removeSizeRow(${jid},${i})" aria-label="Remove size ${i + 1}"${sizes.length > 1 ? '' : ' disabled style="visibility:hidden"'}>✕</button>
    </div>`;
  }).join('');
  const full = sizes.length >= MAX_SHEET_SIZES;
  return `<div class="se-box" style="margin-top:8px">
    <div class="se-title">📐 Sheet sizes <span style="font-weight:400;text-transform:none;letter-spacing:0">— the optimiser picks the best mix</span></div>
    ${rows}
    <button type="button" class="btn-add-remnant" style="margin-top:6px" onclick="addSizeRow(${jid})"${full ? ' disabled' : ''}>+ Add sheet size${!isPro && sizes.length >= FREE_SHEET_SIZES ? ' &#128274;' : ''}${full ? ' (max ' + MAX_SHEET_SIZES + ')' : ''}</button>
    ${!isPro && sizes.length > FREE_SHEET_SIZES ? `<div style="font-size:11.5px;color:#92400e;margin-top:6px">&#128274; The free plan uses the first ${FREE_SHEET_SIZES} sizes. Pro uses all of them.</div>` : ''}
  </div>`;
}

// Sweep all open edit forms and flush their current DOM values into pending.
// The oninput handlers normally keep pending current; this catches anything
// that changed without an input event (autofill, for example).
function flushEditForms() {
  pending.forEach(e => {
    const ed = document.getElementById(`ee-${e.id}`);
    if (!ed || ed.style.display === 'none') return;
    ed.querySelectorAll('input[type=text][data-f]').forEach(function(inp){
      const f = inp.getAttribute('data-f'), v = inp.value.trim();
      if (f === 'name') e.name = v || e.name; else e[f] = v;
    });
    ed.querySelectorAll('.size-row').forEach(function(row){
      const i = +row.getAttribute('data-sz');
      if (!e.sizes) e.sizes = [];
      if (!e.sizes[i]) e.sizes[i] = { w: '', h: '', price: 0, max: null };
      row.querySelectorAll('input[data-f]').forEach(function(inp){ e.sizes[i][inp.getAttribute('data-f')] = inp.value; });
    });
  });
}

function toggleEdit(id) {
  flushEditForms();
  if (_libOpen.has(id)) _libOpen.delete(id); else _libOpen.add(id);
  renderLibEntries();
}
function upd(id,f,v){const e=pending.find(x=>x.id===id);if(e)e[f]=v;}
function updSz(id, i, f, v) {
  const e = pending.find(x => x.id === id);
  if (!e) return;
  if (!e.sizes) e.sizes = [];
  if (!e.sizes[i]) e.sizes[i] = { w: '', h: '', price: 0, max: null };
  e.sizes[i][f] = v;
}
function addSizeRow(id) {
  const e = pending.find(x => x.id === id);
  if (!e) return;
  flushEditForms();
  if (!e.sizes) e.sizes = [];
  if (!isPro && e.sizes.length >= FREE_SHEET_SIZES) {
    showUpgradeModal('\u{1F4D0}', 'More sheet sizes', 'The free plan uses 2 sheet sizes per material. Pro uses up to ' + MAX_SHEET_SIZES + ', with a limit on how many of each you have, and picks the cheapest mix.');
    return;
  }
  if (e.sizes.length >= MAX_SHEET_SIZES) return;
  e.sizes.push({ w: '', h: '', price: '', max: null });
  _libOpen.add(id);
  renderLibEntries();
  const rows = document.querySelectorAll('#ee-' + CSS.escape(String(id)) + ' .size-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('input').focus();
}
function removeSizeRow(id, i) {
  const e = pending.find(x => x.id === id);
  if (!e || !e.sizes || e.sizes.length <= 1) return;
  flushEditForms();
  e.sizes.splice(i, 1);
  renderLibEntries();
}
function delPending(id){pending=pending.filter(x=>x.id!==id);renderLibEntries();}
function addLibEntry(){
  const name=document.getElementById('n-name').value.trim();
  const w1=+document.getElementById('n-w1').value, h1=+document.getElementById('n-h1').value;
  if(!name||!w1||!h1){alert('Name, Size 1 Width and Height are required.');return;}
  const pr1=+document.getElementById('n-pr1').value||0;
  const pr2=+document.getElementById('n-pr2').value||0;
  pending.push({
    id:Date.now(), name,
    material:document.getElementById('n-mat').value.trim(),
    thickness:document.getElementById('n-thk').value.trim(),
    grade:'',
    cuttingMethod:'free',
    allowRotation:true,
    sizes: cleanSizes([
      { w: w1, h: h1, price: pr1 },
      { w: +document.getElementById('n-w2').value || '', h: +document.getElementById('n-h2').value || '', price: pr2 }
    ])
  });
  ['n-name','n-mat','n-thk','n-w1','n-h1','n-pr1','n-w2','n-h2','n-pr2'].forEach(id=>document.getElementById(id).value='');
  renderLibEntries();
}

// ── ENTER KEY NAVIGATION ──────────────────────
// Pressing Enter in any input moves focus to the next visible input on the page.
// Pressing Enter in the last input of a pieces row adds a new piece for that material.
// ── INIT ──────────────────────────────────────

function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀︎' : '☾';
  try { localStorage.setItem('cutnest-theme', next); } catch(e) {}
}
// Apply saved theme on load — must run after DOM ready
(function(){
  try {
    if (cnPrefersDark()) {
      document.documentElement.setAttribute('data-theme','dark');
      // Update button after DOM is ready
      document.addEventListener('DOMContentLoaded', function() {
        const btn = document.getElementById('dark-toggle');
        if (btn) btn.textContent = '☀︎';
      });
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        const btn = document.getElementById('dark-toggle');
        if (btn) btn.textContent = '☾';
      });
    }
  } catch(e) {}
})();

// ── UNDO STACK ────────────────────────────────
const UNDO_MAX = 30;
let undoStack = [];
let redoStack = [];

// A snapshot has to cover everything a user would expect Ctrl+Z to reach, and
// restoring one has to write through to the SAME places a normal edit writes to.
// Previously the snapshot captured {mats, library} but restoring it called only
// saveState(), which writes cutnest-job-v1 (the job). Nothing wrote
// cutnest-lib-v1, so undoing a library change reverted it on screen and left the
// old value on disk — and the next page load silently brought it back.
// The job reference and quantity live in the DOM and were never captured at all.
function snapshotState() {
  const jr = document.getElementById('job-ref');
  const jq = document.getElementById('job-qty');
  return JSON.stringify({
    mats: mats,
    library: library,
    jobRef: jr ? jr.value : '',
    jobQty: jq ? jq.value : '1'
  });
}

function restoreSnapshot(json) {
  const st = JSON.parse(json);
  mats = st.mats;
  library = st.library;
  const jr = document.getElementById('job-ref');
  const jq = document.getElementById('job-qty');
  if (jr && typeof st.jobRef === 'string') jr.value = st.jobRef;
  if (jq && typeof st.jobQty === 'string') jq.value = st.jobQty;
  renderAll();
  saveState();                 // persists the job
  try { persistLib(library); } catch (e) {}   // persists the library
  updateUndoUI();
}

function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];
  updateUndoUI();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  restoreSnapshot(undoStack.pop());
  showToast('↩ Undone');
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  restoreSnapshot(redoStack.pop());
  showToast('↪ Redone');
}
function updateUndoUI() {
  const u = document.getElementById('undo-btn');
  const r = document.getElementById('redo-btn');
  // The buttons ship with inline opacity:.4 to look disabled. Only `disabled`
  // was ever toggled, so they stayed greyed out forever even once live.
  if (u) { u.disabled = !undoStack.length; u.style.opacity = undoStack.length ? '1' : '.4'; }
  if (r) { r.disabled = !redoStack.length; r.style.opacity = redoStack.length ? '1' : '.4'; }
}

// Typing a dimension was not undoable at all, so Ctrl+Z jumped straight past
// every number the user had entered to the last structural change — which reads
// as data loss. Coalesce typing into one undo step per burst so the stack does
// not fill with a snapshot per keystroke.
let _lastTypeUndo = 0;
function pushUndoTyping() {
  const now = Date.now();
  if (now - _lastTypeUndo > 1200) pushUndo();
  _lastTypeUndo = now;
}

// ── SECURITY: sanitise user input before injecting into HTML ──
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

const KEY_STORE='cutnest-licence-v1',SETT_KEY='cutnest-settings-v1',HIST_KEY='cutnest-hist-v1',HIST_MAX=50,FREE_LIB_LIMIT=5;
// Master grades the Pro user has explicitly deleted. Without this list, loadLib
// would re-inject every master entry on each load and a deletion could never
// stick. Stored separately from the library so it survives a library rewrite.
const MASTER_DEL_KEY='cutnest-master-deleted-v1';
function getDeletedMasterIds(){
  try{ const r=localStorage.getItem(MASTER_DEL_KEY); const a=r?JSON.parse(r):[]; return Array.isArray(a)?a:[]; }
  catch(e){ return []; }
}
function setDeletedMasterIds(ids){
  try{ localStorage.setItem(MASTER_DEL_KEY, JSON.stringify(ids||[])); }catch(e){}
}
// ════════════════════════════════════════════════════════════════
// ⚠️ LEMON SQUEEZY CONFIG — THE ONLY PLACE YOU EVER CHANGE THE URL
// When you switch to Live mode: replace the UUID below with your
// LIVE product's checkout UUID (LS dashboard → Products → Share →
// copy checkout link). Every Buy button on this page updates
// automatically from this one constant.
// ════════════════════════════════════════════════════════════════
const LS_URL='https://cutnest.lemonsqueezy.com/checkout/buy/a9fdfebb-ea08-4962-8aae-45e608f0cc6e';

// On load: point every checkout link on the page at LS_URL
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('a[href*="lemonsqueezy.com/checkout"]').forEach(function(a) {
    a.href = LS_URL;
  });
});

const MASTER_LIBRARY = [
  {id:101,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 1.5mm',material:'Mild Steel',thickness:'1.5mm',size1:{w:2450,h:1150,price:85},size2:{w:2050,h:900,price:52}},
  {id:102,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 2mm',material:'Mild Steel',thickness:'2mm',size1:{w:2450,h:1150,price:105},size2:{w:2050,h:900,price:65}},
  {id:103,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 3mm',material:'Mild Steel',thickness:'3mm',size1:{w:2450,h:1150,price:145},size2:{w:1950,h:900,price:88}},
  {id:104,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 4mm',material:'Mild Steel',thickness:'4mm',size1:{w:2450,h:1150,price:185},size2:{w:1950,h:900,price:112}},
  {id:105,allowRotation:true,cuttingMethod:'free',name:'Mild Steel 5mm',material:'Mild Steel',thickness:'5mm',size1:{w:2450,h:1150,price:225},size2:{w:1950,h:900,price:138}},
  {id:203,allowRotation:false,cuttingMethod:'free',name:'S/S 2mm - 304 Brushed',material:'Stainless Steel',thickness:'2mm',size1:{w:2450,h:1150,price:205},size2:{w:1950,h:900,price:118}},
  {id:204,allowRotation:true,cuttingMethod:'free',name:'S/S 2mm - 304',material:'Stainless Steel',thickness:'2mm',size1:{w:2450,h:1150,price:195},size2:{w:1950,h:900,price:112}},
  {id:205,allowRotation:false,cuttingMethod:'free',name:'S/S 2mm - 316 Brushed',material:'Stainless Steel',thickness:'2mm',size1:{w:2450,h:1150,price:225},size2:{w:1950,h:900,price:132}},
  {id:206,allowRotation:true,cuttingMethod:'free',name:'S/S 2mm - 316',material:'Stainless Steel',thickness:'2mm',size1:{w:2450,h:1150,price:215},size2:{w:1950,h:900,price:125}},
  {id:207,allowRotation:false,cuttingMethod:'free',name:'S/S 2.5mm - 316 Brushed',material:'Stainless Steel',thickness:'2.5mm',size1:{w:2450,h:1150,price:268},size2:{w:1950,h:900,price:155}},
  {id:302,allowRotation:true,cuttingMethod:'free',name:'Galv 2mm',material:'Galvanised',thickness:'2mm',size1:{w:2450,h:1150,price:95},size2:{w:1950,h:900,price:58}},
  {id:303,allowRotation:true,cuttingMethod:'free',name:'Galv 3mm',material:'Galvanised',thickness:'3mm',size1:{w:2450,h:1150,price:135},size2:{w:1950,h:900,price:82}},
  {id:402,allowRotation:true,cuttingMethod:'free',name:'Aluminium 2mm',material:'Aluminium',thickness:'2mm',size1:{w:2450,h:1150,price:158},size2:{w:1950,h:900,price:95}},
  {id:403,allowRotation:true,cuttingMethod:'free',name:'Aluminium 3mm',material:'Aluminium',thickness:'3mm',size1:{w:2450,h:1150,price:195},size2:{w:1950,h:900,price:118}},
  {id:501,allowRotation:true,cuttingMethod:'free',name:'Zintec 1mm',material:'Zintec',thickness:'1mm',size1:{w:2450,h:1150,price:72},size2:{w:1950,h:900,price:44}},
  {id:502,allowRotation:true,cuttingMethod:'free',name:'Zintec 1.5mm',material:'Zintec',thickness:'1.5mm',size1:{w:2450,h:1150,price:92},size2:{w:1950,h:900,price:56}},
  {id:601,allowRotation:true,cuttingMethod:'guillotine',name:'MDF 18mm',material:'Timber',thickness:'18mm',size1:{w:2440,h:1220,price:28},size2:{w:1220,h:610,price:15}},
  {id:602,allowRotation:true,cuttingMethod:'guillotine',name:'MDF 12mm',material:'Timber',thickness:'12mm',size1:{w:2440,h:1220,price:22},size2:{w:1220,h:610,price:12}},
  {id:603,allowRotation:false,cuttingMethod:'guillotine',name:'Plywood 18mm (Hardwood Face)',material:'Timber',thickness:'18mm',size1:{w:2440,h:1220,price:45},size2:{w:0,h:0,price:0}},
  {id:604,allowRotation:true,cuttingMethod:'guillotine',name:'OSB 18mm',material:'Timber',thickness:'18mm',size1:{w:2400,h:1200,price:18},size2:{w:0,h:0,price:0}},
  {id:605,allowRotation:false,cuttingMethod:'guillotine',name:'Composite Decking Board',material:'Decking',thickness:'25mm',size1:{w:3600,h:145,price:8},size2:{w:4800,h:145,price:10}},
  {id:701,allowRotation:true,cuttingMethod:'free',name:'Acrylic 3mm Clear',material:'Acrylic',thickness:'3mm',size1:{w:2440,h:1220,price:55},size2:{w:1220,h:610,price:30}},
  {id:702,allowRotation:true,cuttingMethod:'free',name:'Acrylic 5mm Clear',material:'Acrylic',thickness:'5mm',size1:{w:2440,h:1220,price:85},size2:{w:1220,h:610,price:45}},
];

let isPro=false,settings={kerf:4,companyName:''};

// ════════════════════════════════════════════════════════════════
// LICENCE PRODUCT BINDING
// Only licence keys issued by the CutNest store unlock Pro. Without this, a
// key from ANY Lemon Squeezy store (anyone can open one) would work.
// Store: cutnest.lemonsqueezy.com, ID from LS dashboard → Settings → Stores.
// If you ever move to a new store, update this or every key will be refused.
// ════════════════════════════════════════════════════════════════
const LS_STORE_ID = 394602;
const LS_VARIANT_ID = null;   // optional, e.g. 654321

// One-time console warning so an unbound build can never ship unnoticed again.
// (The previous comment claimed this was logged; nothing actually logged it.)
let _lsBindWarned = false;
function warnIfUnbound(){
  if (_lsBindWarned) return;
  _lsBindWarned = true;
  if (LS_STORE_ID == null && LS_VARIANT_ID == null && typeof console !== 'undefined' && console.warn) {
    console.warn('[CutNest] LS_STORE_ID is not set — ANY active Lemon Squeezy licence key, from ANY store, will unlock Pro. Set LS_STORE_ID in app.html.');
  }
}

// Returns true if the API response's meta belongs to our product. If no binding
// is configured, returns true (skips the check) and warns once in the console.
function licenceMetaMatches(resp){
  if (LS_STORE_ID == null && LS_VARIANT_ID == null) { warnIfUnbound(); return true; }
  const meta = resp && resp.meta;
  if (!meta) return false;
  // Compare as strings so a number/string difference in the API response
  // can never lock out a genuine customer.
  if (LS_STORE_ID != null && String(meta.store_id) !== String(LS_STORE_ID)) return false;
  if (LS_VARIANT_ID != null && String(meta.variant_id) !== String(LS_VARIANT_ID)) return false;
  return true;
}

// How long a cached "verified" licence is trusted WITHOUT a fresh server check.
// This caps how long a cancelled/expired/refunded subscriber can keep Pro purely
// offline. Online, we re-validate every load (see revalidateLicence). 3 days is a
// fair offline grace so a fabricator on a flaky workshop connection isn't locked
// out mid-job, while a churned account loses Pro within days.
const LICENCE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// Synchronous, offline-safe gate used at startup. A stored key only counts if it
// was verified against Lemon Squeezy AND that verification is within the grace
// window. This is deliberately strict: the asynchronous revalidateLicence() below
// then re-checks against the server and can both RESTORE (renew the grace) or
// REVOKE (expired/disabled/refunded) Pro.
function checkLicence(){
  try{
    const s=localStorage.getItem(KEY_STORE);
    if(s){
      const d=JSON.parse(s);
      if(d&&d.key&&d.verified===true&&/^[A-Za-z0-9-]{20,}$/.test(d.key)){
        const last = d.lastCheck ? Date.parse(d.lastCheck) : (d.date ? Date.parse(d.date) : 0);
        if(isFinite(last) && (Date.now() - last) <= LICENCE_GRACE_MS){
          isPro=true;return;
        }
        // Verified once but the grace window has lapsed: stay locked until a
        // successful server re-check restores it. Prevents an indefinitely
        // offline "verified:true" from being a permanent unlock.
      }
    }
  }catch(e){}
  isPro=false;
}

// Re-validate the stored key against Lemon Squeezy. Called on load (when online).
// On a definitive negative (expired / disabled / not-found) it REVOKES Pro and
// clears the stored flag. On success it refreshes lastCheck so the grace window
// rolls forward. Network errors are non-fatal — we keep whatever checkLicence()
// already decided so a workshop outage never locks out a paying user.
async function revalidateLicence(){
  let d;
  try{ const s=localStorage.getItem(KEY_STORE); d=s?JSON.parse(s):null; }catch(e){ d=null; }
  if(!d||!d.key) return;
  let resp;
  try{
    const body = 'license_key='+encodeURIComponent(d.key) + (d.instanceId?('&instance_id='+encodeURIComponent(d.instanceId)):'');
    const r=await fetch('https://api.lemonsqueezy.com/v1/licenses/validate',{
      method:'POST',
      headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},
      body:body
    });
    resp=await r.json();
  }catch(err){
    return; // offline / network error: leave current state untouched
  }
  const status = resp && resp.license_key && resp.license_key.status;
  const valid  = resp && resp.valid === true && licenceMetaMatches(resp);
  // Definitive negatives we will REVOKE on. A generic resp.error (rate limit,
  // 500, malformed) is NOT treated as a revocation — only an explicit expired/
  // disabled status, or an explicit valid:false, or a wrong-product meta. This
  // stops a transient API blip from logging out a paying customer.
  const wrongProduct = (LS_STORE_ID != null || LS_VARIANT_ID != null) &&
                       resp && resp.valid === true && !licenceMetaMatches(resp);
  const definitelyDead = status==='expired' || status==='disabled' ||
                         (resp && resp.valid === false) || wrongProduct;
  if(valid && status==='active'){
    // Still good — roll the grace window forward.
    d.verified=true; d.lastCheck=new Date().toISOString();
    try{ localStorage.setItem(KEY_STORE, JSON.stringify(d)); }catch(e){}
    if(!isPro){ isPro=true; updateProUI(); loadLib(); }
  } else if(definitelyDead){
    // Definitive negative: revoke immediately.
    try{ localStorage.setItem(KEY_STORE, JSON.stringify({key:d.key, verified:false, revokedReason:status||'invalid', date:d.date})); }catch(e){}
    if(isPro){
      isPro=false; updateProUI(); loadLib();
      showToast(status==='expired'
        ? 'Your CutNest Pro licence has expired — renew at cutnest.co.uk'
        : 'CutNest Pro licence is no longer active');
    }
  }
}

async function validateAndSaveKey(){
  const ki=document.getElementById('licence-key-input'),se=document.getElementById('key-status');
  if(!ki||!se)return;
  const key=ki.value.trim();
  if(!key){se.className='key-status invalid';se.textContent='Enter your licence key';return;}
  se.className='key-status none';se.textContent='Activating…';
  try{
    // Use the ACTIVATE endpoint, not validate. A freshly purchased key has
    // status "inactive" until it is activated for the first time — validate
    // alone would reject it. Activate flips it to active and creates an instance.
    const instanceName = 'CutNest-' + (Math.random().toString(36).slice(2,8));
    const r=await fetch('https://api.lemonsqueezy.com/v1/licenses/activate',{
      method:'POST',
      headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},
      body:'license_key='+encodeURIComponent(key)+'&instance_name='+encodeURIComponent(instanceName)
    });
    const d=await r.json();

    const keyStatus = d.license_key && d.license_key.status;
    const activatedOk = d.activated === true;
    const limitReached = d.error && /activation limit/i.test(d.error);

    if(activatedOk){
      if(!licenceMetaMatches(d)){
        se.className='key-status invalid';
        se.textContent='This licence key is not for CutNest. Check you copied the right key.';
        return;
      }
      // Fresh, clean activation. Record the instance so we can re-validate later.
      const store = { key:key, verified:true, date:new Date().toISOString(), lastCheck:new Date().toISOString() };
      if(d.instance && d.instance.id) store.instanceId = d.instance.id;
      localStorage.setItem(KEY_STORE,JSON.stringify(store));
      isPro=true;
      se.className='key-status valid';
      se.textContent='Pro active — loading…';
      updateProUI();
      loadLib().then(function(){
        setTimeout(function(){ closeSettings(); showToast('✓ CutNest Pro unlocked!'); },1200);
      });
    } else if(limitReached){
      // The key is real but has used all its device activations. Rather than
      // auto-passing (which let one key unlock unlimited machines), confirm the
      // key is genuinely ACTIVE via the validate endpoint before granting Pro.
      // A licence whose subscription has lapsed will fail here.
      se.textContent='Checking licence…';
      let ok=false, vstatus=null;
      try{
        const vr=await fetch('https://api.lemonsqueezy.com/v1/licenses/validate',{
          method:'POST',
          headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},
          body:'license_key='+encodeURIComponent(key)
        });
        const vd=await vr.json();
        vstatus = vd && vd.license_key && vd.license_key.status;
        ok = vd && vd.valid === true && vstatus==='active' && licenceMetaMatches(vd);
      }catch(e){ ok=false; }
      if(ok){
        const store = { key:key, verified:true, date:new Date().toISOString(), lastCheck:new Date().toISOString() };
        localStorage.setItem(KEY_STORE,JSON.stringify(store));
        isPro=true;
        se.className='key-status valid';
        se.textContent='Pro active — loading…';
        updateProUI();
        loadLib().then(function(){
          setTimeout(function(){ closeSettings(); showToast('✓ CutNest Pro unlocked!'); },1200);
        });
      } else {
        se.className='key-status invalid';
        se.textContent = (vstatus==='expired')
          ? 'Licence expired — renew your subscription at cutnest.co.uk'
          : 'This key has reached its activation limit. Contact hello@cutnest.co.uk to free up a device.';
      }
    } else if(keyStatus==='expired'){
      se.className='key-status invalid';
      se.textContent='Licence expired — renew your subscription at cutnest.co.uk';
    } else if(keyStatus==='disabled'){
      se.className='key-status invalid';
      se.textContent='Licence disabled — contact hello@cutnest.co.uk';
    } else {
      se.className='key-status invalid';
      se.textContent=d.error||'Invalid key — check your email or contact hello@cutnest.co.uk';
    }
  }catch(err){
    se.className='key-status invalid';
    se.textContent='Could not reach licence server — check your connection and try again';
  }
}

function buyPro(){window.open(LS_URL,'_blank');}

function showUpgradeModal(icon,title,desc){
  const ids=['upgrade-icon','upgrade-title','upgrade-desc'],vals=[icon||'!',title||'Pro Feature',desc||'Upgrade to Pro.'];
  ids.forEach(function(id,i){const el=document.getElementById(id);if(el)el.textContent=vals[i];});
  const um=document.getElementById('upgrade-modal');if(um)um.style.display='flex';
}

function updateProUI(){
  function setDisplay(id,v){const el=document.getElementById(id);if(el)el.style.display=v;}
  setDisplay('pro-badge-hdr',isPro?'flex':'none');
  setDisplay('pro-banner',isPro?'none':'flex');
  setDisplay('history-btn',isPro?'inline-flex':'none');
  setDisplay('qty-wrap',isPro?'block':'none');
  setDisplay('qty-ghost',isPro?'none':'block');
  setDisplay('ghost-mat-block',isPro?'none':'block');
  const amw=document.getElementById('add-mat-wrap');
  if(amw)amw.style.display=(isPro&&mats&&mats.length<5)?'block':'none';
  const mlt=document.getElementById('master-lib-txt');
  if(mlt)mlt.textContent=isPro?'Active — '+MASTER_LIBRARY.length+' UK grades loaded':'Upgrade to Pro to unlock the master library';
  updateLibLimitNotice();
}

function showLanding(){window.location.href='/';}
function showApp(){}
function handleRoute(){}

// The old acceptCookies() wrote 'cutnest-cookies' and was never called by
// anything — there was no banner in the app at all. These are the real handlers.
function cnHideCookieBar(){ const b=document.getElementById('cn-cookie-bar'); if(b) b.style.display='none'; }
function cnAcceptCookies(){
  try{ localStorage.setItem('cn-cookie','accepted'); }catch(e){}
  cnHideCookieBar();
  if (typeof loadAnalytics === 'function') loadAnalytics();
}
function cnDeclineCookies(){
  try{ localStorage.setItem('cn-cookie','declined'); }catch(e){}
  cnHideCookieBar();
}
function cnInitCookieBar(){
  let choice = null;
  try{ choice = localStorage.getItem('cn-cookie'); }catch(e){}
  // '1' is the legacy landing-page value meaning only "banner dismissed", not
  // "analytics accepted", so it does not count as consent.
  if (choice === 'accepted' || choice === 'declined') return;
  const b = document.getElementById('cn-cookie-bar');
  if (b) setTimeout(function(){ b.style.display = 'flex'; }, 1200);
}

// Kerf in mm, 0-100, to 0.1mm. parseInt(v)||4 used to turn a deliberate 0
// (and any laser kerf under 1mm, e.g. 0.3) back into 4mm on the next load,
// while Settings still showed the value the user typed.
function parseKerf(v){
  const n = parseFloat(v);
  return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : 4;
}
function loadSettings(){
  try{const r=localStorage.getItem(SETT_KEY);if(r)settings=Object.assign({kerf:4,companyName:'',minOffcutLong:1000,minOffcutShort:300},JSON.parse(r));}catch(e){}
  if(settings.minOffcutLong==null)settings.minOffcutLong=1000;
  if(settings.minOffcutShort==null)settings.minOffcutShort=300;
  KERF=parseKerf(settings.kerf);
  const kd=document.getElementById('kerf-display');if(kd)kd.textContent=KERF+'mm';
}
// Snapshot taken when Settings opens so Cancel has something to restore. Every
// field in the modal saves on `oninput`, and closeSettings() itself wrote to
// localStorage, so "Cancel" previously just saved and closed — there was no way
// to back out of a kerf change, the one setting that most changes the answer.
let _settingsSnapshot = null;

function openSettings(){
  loadSettings();
  try { _settingsSnapshot = JSON.parse(JSON.stringify(settings)); } catch(e) { _settingsSnapshot = null; }
  const kf=document.getElementById('kerf-setting'),cn=document.getElementById('company-name');
  const ki=document.getElementById('licence-key-input'),ks=document.getElementById('key-status');
  if(kf)kf.value=(settings.kerf!=null?settings.kerf:4);if(cn)cn.value=settings.companyName||'';
  const ol=document.getElementById('offcut-long'),os=document.getElementById('offcut-short');
  if(ol)ol.value=settings.minOffcutLong||1000;
  if(os)os.value=settings.minOffcutShort||300;
  if(ki&&ks){
    const s=localStorage.getItem(KEY_STORE);
    if(s){
      try{
        const d=JSON.parse(s);
        ki.value=d.key||'';
        if(d.verified===true){ks.className='key-status valid';ks.textContent='Pro licence active';}
        else{ks.className='key-status invalid';ks.textContent='Key not yet verified — click Activate Key';}
      }catch(e){}
    }else{ks.className='key-status none';ks.textContent='No key entered';}
  }
  updateProUI();
  const sm=document.getElementById('settings-modal');if(sm)sm.style.display='flex';
}
// Discard everything changed since the modal opened, then close.
function cancelSettings(){
  if(_settingsSnapshot){
    settings = JSON.parse(JSON.stringify(_settingsSnapshot));
    KERF = parseKerf(settings.kerf);
    try{ localStorage.setItem(SETT_KEY, JSON.stringify(settings)); }catch(e){}
    const kd=document.getElementById('kerf-display'); if(kd) kd.textContent = KERF + 'mm';
  }
  const sm=document.getElementById('settings-modal'); if(sm) sm.style.display='none';
}

// Kept for the licence-activation flow, which closes the modal after a
// successful unlock and must NOT roll settings back.
function closeSettings(){
  const sm=document.getElementById('settings-modal');if(sm)sm.style.display='none';
}
function saveSettings() {
  const kf = document.getElementById('kerf-setting');
  const cn = document.getElementById('company-name');
  const ol = document.getElementById('offcut-long');
  const os = document.getElementById('offcut-short');
  if (kf) { settings.kerf = parseKerf(kf.value); settings.kerfTouched = true; KERF = settings.kerf; }
  if (cn) settings.companyName = cn.value ? cn.value.trim() : '';
  if (ol) settings.minOffcutLong = Math.max(0, Math.min(6000, parseInt(ol.value) || 0));
  if (os) settings.minOffcutShort = Math.max(0, Math.min(6000, parseInt(os.value) || 0));
  localStorage.setItem(SETT_KEY, JSON.stringify(settings));
  const kd = document.getElementById('kerf-display');
  if (kd) kd.textContent = KERF + 'mm';
}
function saveSettingsAndClose() {
  saveSettings();
  const sm = document.getElementById('settings-modal');
  if (sm) sm.style.display = 'none';
  showToast('✓ Settings saved');
}

async function saveData(lib){
  // Never persist transient shared-link materials. They live in memory so a
  // shared job renders, but only become permanent when the user explicitly
  // promotes them (saveLibClose clears the _transient flag first).
  const persistable = (lib || []).filter(function(e){ return !(e && e._transient); });
  if (!isPro) {
    // A non-Pro session never holds master-library entries in `library`, so
    // saving it verbatim would erase any master grades the user edited while
    // they were subscribed. Carry those stored entries forward untouched so a
    // lapsed subscription never destroys their price work.
    try {
      const prev = JSON.parse(localStorage.getItem(STOR_KEY) || '[]');
      if (Array.isArray(prev)) {
        const masterIds = {}; MASTER_LIBRARY.forEach(function(m){ masterIds[m.id] = 1; });
        const have = {}; persistable.forEach(function(e){ if (e && e.id != null) have[e.id] = 1; });
        prev.forEach(function(e){ if (e && masterIds[e.id] && !have[e.id]) persistable.push(e); });
      }
    } catch(e){}
  }
  localStorage.setItem(STOR_KEY,JSON.stringify(persistable));
}

// Coerce a stored library entry into the shape the app expects, dropping nothing
// but healing malformed/old/partial data. Guards loadLib against any future
// schema change or corrupted localStorage: a bad field becomes a safe default
// rather than throwing or rendering garbage. Returns null only for entries too
// broken to use (no object at all), which the caller filters out.
function normalizeLibEntry(e){
  if (!e || typeof e !== 'object') return null;
  return {
    id: (e.id !== undefined && e.id !== null) ? e.id : ('lib-' + Date.now() + '-' + Math.random().toString(36).slice(2,7)),
    name: (typeof e.name === 'string' ? e.name : '').slice(0, 80),
    material: (typeof e.material === 'string' ? e.material : '').slice(0, 60),
    thickness: (typeof e.thickness === 'string' ? e.thickness : '').slice(0, 30),
    grade: (typeof e.grade === 'string' ? e.grade : '').slice(0, 30),
    cuttingMethod: (e.cuttingMethod === 'guillotine') ? 'guillotine' : 'free',
    allowRotation: e.allowRotation !== false,
    sizes: cleanSizes(Array.isArray(e.sizes) ? e.sizes : [e.size1, e.size2]),
    _transient: e._transient === true || undefined
  };
}

// Sheet sizes as stored: [{w, h, price, max}], only real sizes, one per
// width x height, at most MAX_SHEET_SIZES. Libraries saved before multiple
// sizes existed had size1/size2; normalizeLibEntry passes those in here.
function cleanSizes(raw) {
  const out = [], seen = {};
  (raw || []).forEach(function(s){
    if (!s || typeof s !== 'object') return;
    const w = parseFloat(s.w), h = parseFloat(s.h);
    if (!(w > 0) || !(h > 0) || w > 100000 || h > 100000) return;
    const key = w + 'x' + h;
    if (seen[key] || out.length >= MAX_SHEET_SIZES) return;
    seen[key] = 1;
    const price = parseFloat(s.price);
    const max = parseInt(s.max, 10);
    out.push({ w: w, h: h, price: isFinite(price) && price > 0 ? Math.min(price, 1000000) : 0,
               max: max >= 1 ? Math.min(max, 9999) : null });
  });
  return out;
}

// The size on a material with these exact dimensions, for pricing a sheet.
function sizeByDims(libMat, w, h) {
  return (libMat && libMat.sizes || []).find(function(s){ return s.w === w && s.h === h; }) || null;
}

// Free plan: 2 sheet sizes per material, no stock limits.
const FREE_SHEET_SIZES = 2;

async function loadLib(){
  setSS('saving','Loading…');
  try{
    const saved=localStorage.getItem(STOR_KEY);
    let savedLib=saved?JSON.parse(saved):null;
    // Schema guard: normalise every stored entry so an old/corrupt shape can't
    // break the app. Non-array or unusable data falls back to defaults below.
    if (Array.isArray(savedLib)) {
      savedLib = savedLib.map(normalizeLibEntry).filter(Boolean);
    } else {
      savedLib = null;
    }
    const masterById = {};
    MASTER_LIBRARY.forEach(function(m){ masterById[m.id] = m; });

    if(isPro){
      // Start from the master library, then add the user's custom entries.
      // Custom entries are kept by ID (so a job referencing them never breaks).
      const masterByName = {};
      MASTER_LIBRARY.forEach(function(m){ masterByName[(m.name||'').trim().toLowerCase()] = m; });

      const custom = (savedLib||[]).filter(function(e){ return e && !masterById[e.id]; });

      // REPAIR: if a custom entry has no valid sheet size but its name matches a
      // master grade, heal it by copying the master's sizes. This fixes corrupted
      // entries WITHOUT removing them, so jobs that reference them keep working.
      custom.forEach(function(e){
        if(!e.sizes.length && e.name){
          const master = masterByName[e.name.trim().toLowerCase()];
          if(master){
            e.sizes = normalizeLibEntry(master).sizes;
            if(!e.cuttingMethod) e.cuttingMethod = master.cuttingMethod||'free';
          }
        }
      });

      // MERGE, don't replace. Previously any saved entry whose id matched a
      // master id was filtered out and the hard-coded master used instead, so a
      // Pro user's edits to a master grade (their real supplier price, their
      // real sheet size, their grain lock) were written to localStorage, appeared
      // to work, then silently reverted on the next load. Master grades are now
      // DEFAULTS: a stored entry with the same id wins, and a deleted one stays
      // deleted. "Reset" in the Library modal restores the CutNest default.
      const storedById = {};
      (savedLib||[]).forEach(function(e){ if(e && e.id!=null) storedById[e.id] = e; });
      const deleted = getDeletedMasterIds();
      const masters = [];
      MASTER_LIBRARY.forEach(function(m){
        if (deleted.indexOf(m.id) !== -1) return;              // user deleted it
        masters.push(storedById[m.id] ? storedById[m.id] : m); // user's edit wins
      });

      library = masters.concat(custom).map(normalizeLibEntry).filter(Boolean);
      setSS('ok','Pro library active');
    }else{
      // Not Pro: the master library is a Pro feature, so master-id entries are
      // withheld. They are NOT erased from storage — a lapsed subscriber's edited
      // prices come straight back if they re-subscribe. Their own custom
      // materials are always kept.
      library = (savedLib || defaultLib()).filter(function(e){ return e && !masterById[e.id]; });
      setSS('ok','Ready');
    }
    await saveData(library);
  }catch(err){library=defaultLib();setSS('err','Error');}
  renderAll();
}

async function persistLib(lib){setSS('saving','Saving…');try{await saveData(lib);setSS('ok','Saved');}catch(err){setSS('err','Save failed');}}

function saveToHistory(){
  if(!isPro||!calcResult)return;
  try{
    const jr=(document.getElementById('job-ref')||{}).value||'Untitled';
    const ts=calcResult.results.reduce(function(s,r){return s+boughtSheets(r.sheets).length;},0);
    const sm=calcResult.results.map(function(r){
      return r.libMat.name+': '+Object.entries(r.sizeMap).map(function(e){return e[1]+'x '+e[0]+'mm';}).join(', ');
    }).join(' | ');
    const entry={id:Date.now(),jobRef:jr,totalSheets:ts,summary:sm,
      date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
      mats:JSON.parse(JSON.stringify(mats))
    };
    const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
    // saveToHistory runs on EVERY calculate, so tweaking one dimension and
    // recalculating five times used to burn five of the fifty slots on the same
    // job. If the newest entry is the same job reference with the same pieces,
    // replace it instead of stacking another copy.
    const sig = JSON.stringify(entry.mats);
    if (h.length && h[0].jobRef === entry.jobRef && JSON.stringify(h[0].mats) === sig) h.shift();
    h.unshift(entry);if(h.length>HIST_MAX)h.splice(HIST_MAX);
    localStorage.setItem(HIST_KEY,JSON.stringify(h));
  }catch(err){}
}
function openHistory(){
  if(!isPro){showUpgradeModal('!','Job History','Upgrade to Pro to access job history.');return;}
  renderHistoryEntries();const hm=document.getElementById('history-modal');if(hm)hm.style.display='flex';
}
function closeHistory(){const hm=document.getElementById('history-modal');if(hm)hm.style.display='none';}
function renderHistoryEntries(){
  const wrap=document.getElementById('history-entries');if(!wrap)return;
  try{
    const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
    if(!h.length){wrap.innerHTML='<p style="color:var(--muted);font-size:13px">No jobs saved yet.</p>';return;}
    wrap.innerHTML=h.map(function(e){
      return '<div class="hist-entry"><div><div class="hist-ref">'+esc(e.jobRef)+'</div>'
        +'<div class="hist-meta">'+e.date+' - '+e.totalSheets+' sheet'+(e.totalSheets!==1?'s':'')+'</div>'
        +'<div class="hist-summary">'+esc(e.summary)+'</div></div>'
        +'<div class="hist-actions">'
        +'<button class="btn btn-teal" style="padding:6px 12px;font-size:12px" onclick="loadHistoryJob('+e.id+')">Load</button>'
        +'<button class="btn-del" onclick="deleteHistoryJob('+e.id+')">x</button>'
        +'</div></div>';
    }).join('');
  }catch(err){wrap.innerHTML='<p style="color:var(--red)">Could not load.</p>';}
}
function loadHistoryJob(id){
  try{
    const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
    const entry=h.find(function(e){return e.id===id;});
    if(!entry)return;
    mats=entry.mats;renderAll();
    // The job stores material IDs, not the materials themselves. If one has
    // since been deleted or hidden, the dropdown silently comes back empty and
    // calculate says "Please select a material" with no explanation. Say so.
    const missing = mats.filter(function(m){
      return m.selectedMatId && !library.some(function(l){ return l.id == m.selectedMatId; });
    }).length;
    if (missing) {
      setTimeout(function(){
        showToast('⚠ ' + missing + ' material' + (missing!==1?'s are':' is') + ' no longer in your library — re-select ' + (missing!==1?'them':'it') + ' before calculating', 5200);
      }, 400);
    }
    const jr=document.getElementById('job-ref');if(jr)jr.value=entry.jobRef;
    const out=document.getElementById('output');if(out)out.style.display='none';
    calcResult=null;closeHistory();window.scrollTo({top:0,behavior:'smooth'});
  }catch(err){}
}
function deleteHistoryJob(id){
  if(!confirm('Delete this job?'))return;
  try{
    const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
    localStorage.setItem(HIST_KEY,JSON.stringify(h.filter(function(e){return e.id!==id;})));
    renderHistoryEntries();
  }catch(err){}
}


function saveState() {
  try {
    const jr = document.getElementById('job-ref');
    const jq = document.getElementById('job-qty');
    // Was: mats: JSON.parse(JSON.stringify(mats)) — a deep clone that was
    // immediately re-serialised by the outer stringify, so the job was walked
    // THREE times instead of once. This runs on every keystroke in a width,
    // height or quantity field, so the waste was per-character.
    localStorage.setItem('cutnest-job-v1', JSON.stringify({
      jobRef: jr ? jr.value : '',
      jobQty: jq ? jq.value : '1',
      mats: mats
    }));
  } catch(e) {}
}

function restoreState() {
  try {
    const raw = localStorage.getItem('cutnest-job-v1');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state.mats && state.mats.length) { mats = state.mats; renderAll(); }
    const jr = document.getElementById('job-ref'); if (jr && state.jobRef) jr.value = state.jobRef;
    const jq = document.getElementById('job-qty'); if (jq && state.jobQty) jq.value = state.jobQty;
  } catch(e) {}
}

function newJob() {
  if (!confirm('Start a new job? Current pieces will be cleared.')) return;
  pushUndo();
  mats = [{id:'mat-1', selectedMatId:null, pieces:[{w:'',h:'',qty:1}]}];
  const jr = document.getElementById('job-ref'); if (jr) jr.value = '';
  const jq = document.getElementById('job-qty'); if (jq) jq.value = '1';
  const out = document.getElementById('output'); if (out) out.style.display = 'none';
  const sb = document.getElementById('stale-banner'); if (sb) sb.style.display = 'none';
  calcResult = null;
  localStorage.removeItem('cutnest-job-v1');
  renderAll();
}

function addMultiplePieces(matId) {
  const m = mats.find(function(x){return x.id===matId;});
  if (!m) return;
  pushUndo();
  const qtyEl = document.getElementById('bulk-qty-' + matId);
  const count = Math.min(50, Math.max(2, parseInt(qtyEl ? qtyEl.value : 5) || 5));
  for (let i = 0; i < count; i++) m.pieces.push({w:'',h:'',qty:1,label:''});
  renderAll(); saveState();
}

function duplicatePiece(matId, pi) {
  const m = mats.find(function(x){return x.id===matId;});
  if (!m || !m.pieces[pi]) return;
  pushUndo();
  const copy = Object.assign({}, m.pieces[pi]);
  m.pieces.splice(pi + 1, 0, copy);
  renderAll(); saveState();
}

function updateLibLimitNotice() {
  const notice = document.getElementById('lib-limit-notice');
  const addForm = document.getElementById('add-form-wrap');
  if (!notice || !addForm) return;
  if (!isPro && library.length >= FREE_LIB_LIMIT) {
    notice.style.display = 'block'; addForm.style.display = 'none';
  } else {
    notice.style.display = 'none'; addForm.style.display = 'block';
  }
}

// Scrolling the page with the cursor over a focused number input used to
// increment/decrement it silently. Blur instead: the page scrolls, the value
// does not change.
document.addEventListener('wheel', function(e){
  const el = document.activeElement;
  if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) el.blur();
}, { passive: true });

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); calculate(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  if (e.key === 'Escape') {
    const sm = document.getElementById('settings-modal');
    // Settings saves on every keystroke, so Escape must roll back like Cancel
    // rather than leaving a half-typed kerf committed.
    if (sm && sm.style.display !== 'none') { cancelSettings(); return; }
    ['lib-modal','history-modal','upgrade-modal','zoom-modal','paste-modal','offcut-modal'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none') el.style.display = 'none';
    });
  }
});


function openZoomByIndex(idx, sheetNo) {
  const arr = window._zoomSheets || [];
  const sh = arr[idx];
  if (!sh) return;
  openZoom(sh, 'Sheet ' + sheetNo + ' — ' + sh.sheetW + '×' + sh.sheetH + 'mm');
}

function openZoom(sheetData, title) {
  const modal = document.getElementById('zoom-modal');
  const canvas = document.getElementById('zoom-canvas');
  const legend = document.getElementById('zoom-legend');
  const titleEl = document.getElementById('zoom-title');
  if (!modal || !canvas) return;

  titleEl.textContent = title;
  const maxW = Math.min(window.innerWidth * 0.9, 1200);
  const maxH = window.innerHeight * 0.72;
  const scale = Math.min(maxW / sheetData.sheetW, maxH / sheetData.sheetH, 0.85);
  const cw = Math.round(sheetData.sheetW * scale);
  const ch = Math.round(sheetData.sheetH * scale);

  let html = `<div style="position:relative;width:${cw}px;height:${ch}px;background:repeating-linear-gradient(-45deg,rgba(15,76,92,.04),rgba(15,76,92,.04) 1px,transparent 1px,transparent 8px);border:2px solid var(--bdr2);border-radius:3px;overflow:hidden;flex-shrink:0">`;
  if (sheetData.usableOffcut) {
    const o = sheetData.usableOffcut;
    const ox=Math.round(o.x*scale), oy=Math.round(o.y*scale);
    const ow=Math.max(2,Math.round(o.w*scale)-1), oh=Math.max(2,Math.round(o.h*scale)-1);
    html += `<div title="Usable offcut: ${Math.round(o.w)}×${Math.round(o.h)}mm" style="position:absolute;left:${ox}px;top:${oy}px;width:${ow}px;height:${oh}px;background:repeating-linear-gradient(45deg,rgba(5,150,105,.18),rgba(5,150,105,.18) 6px,rgba(5,150,105,.32) 6px,rgba(5,150,105,.32) 12px);border:2px dashed var(--green);box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center">${ow>60&&oh>30?`<div style="font-size:${Math.min(15,ow/8)}px;font-weight:700;color:#065f46;line-height:1.3">USABLE OFFCUT<br><span style="font-weight:600;font-size:.85em">${Math.round(o.w)}×${Math.round(o.h)}mm</span></div>`:''}</div>`;
  }
  sheetData.placed.forEach(p => {
    const col = COLORS[p.pieceIndex % COLORS.length];
    const px = Math.round(p.x * scale), py = Math.round(p.y * scale);
    const pw = Math.max(2, Math.round(p.w * scale) - 1), ph = Math.max(2, Math.round(p.h * scale) - 1);
    const show = pw > 32 && ph > 18;
    html += `<div title="${esc(p.label||'P'+(p.pieceIndex+1))}: ${p.w}×${p.h}mm" style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;background:${col}d0;border:1.5px solid ${col};border-radius:2px;overflow:hidden;box-sizing:border-box">`;
    if (show) html += `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.min(13, pw / 5)}px;text-shadow:0 1px 3px rgba(0,0,0,.5);text-align:center;padding:3px;line-height:1.2">${esc(p.label || 'P' + (p.pieceIndex + 1))}${p.rotated ? '<span style="font-size:.75em">↻</span>' : ''}<br><span style="font-weight:400;font-size:.8em;opacity:.85">${p.w}×${p.h}</span></div>`;
    html += `</div>`;
  });
  html += `</div>`;
  canvas.innerHTML = html;

  legend.innerHTML = sheetData.placed.map(p => {
    const col = COLORS[p.pieceIndex % COLORS.length];
    return `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--sky);border:1px solid var(--bdr);border-radius:6px;padding:3px 9px;font-size:12px"><div style="width:10px;height:10px;border-radius:2px;background:${col};flex-shrink:0"></div>${esc(p.label || 'P' + (p.pieceIndex + 1))} <span style="color:var(--muted)">${p.w}×${p.h}${p.rotated ? ' ↻' : ''}</span></div>`;
  }).join('');

  modal.style.display = 'flex';
}

function doPrint() {
  const meta = document.getElementById('print-header-meta');
  if (meta) {
    const jr = (document.getElementById('job-ref') || {}).value || 'Untitled';
    const co = (settings && settings.companyName) || '';
    const dt = new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
    meta.textContent = (co ? co + '  ·  ' : '') + 'Job: ' + jr + '  ·  ' + dt;
  }
  window.print();
}

// Plain characters, not entities: showUpgradeModal sets textContent.
const REMNANT_UPSELL = ['\u267B','Remnants & offcut stock','Pro cuts your leftover sheets first, keeps the usable offcuts from every job, and offers them back on the next job in that material \u2014 so you use stock you already own before buying a new sheet.'];
function openRemnantInput(matId) {
  if (!isPro) { showUpgradeModal.apply(null, REMNANT_UPSELL); return; }
  const el = document.getElementById('remnant-form-' + matId);
  if (el) el.style.display = 'block';
}
function cancelRemnant(matId) {
  const el = document.getElementById('remnant-form-' + matId);
  if (el) el.style.display = 'none';
  const rw = document.getElementById('rem-w-' + matId);
  const rh = document.getElementById('rem-h-' + matId);
  if (rw) rw.value = '';
  if (rh) rh.value = '';
}
function saveRemnant(matId) {
  const rw = parseInt((document.getElementById('rem-w-' + matId)||{}).value)||0;
  const rh = parseInt((document.getElementById('rem-h-' + matId)||{}).value)||0;
  if (!rw || !rh || rw < 10 || rh < 10) {
    alert('Please enter valid remnant dimensions (minimum 10mm).');
    return;
  }
  const m = mats.find(function(x){return x.id===matId;});
  if (m) { pushUndo(); m.remnant = {w:rw,h:rh}; renderAll(); saveState(); }
}
function removeRemnant(matId) {
  const m = mats.find(function(x){return x.id===matId;});
  if (m) { pushUndo(); delete m.remnant; renderAll(); saveState(); }
}
document.addEventListener('DOMContentLoaded',function(){
  checkLicence();
  loadSettings();
  cnInitCookieBar();
  // Compile the engine in the worker while the user is still typing, so the
  // first Calculate doesn't pay the start-up cost.
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warmPackWorker);
  else setTimeout(warmPackWorker, 1500);
  // Re-check the licence against Lemon Squeezy in the background (online only).
  // Can restore Pro (rolls the offline grace window forward) or revoke it
  // (expired / disabled / refunded). Never blocks startup.
  if (navigator.onLine !== false) { setTimeout(revalidateLicence, 1200); }
  loadLib().then(function(){
    // Load shared job from URL if present.
    // SECURITY: a ?job= link is fully attacker-controlled. We sanitise every
    // field before it touches the DOM or the library, and we NEVER overwrite or
    // persist the user's saved library from a link — shared materials are added
    // to the in-memory library as TRANSIENT entries (id prefixed 'shared-') so
    // the job renders, but they only become permanent if the user explicitly
    // saves. This means a malicious or stale link cannot silently destroy a
    // user's real materials/prices or plant a persistent payload.
  const urlParams = new URLSearchParams(window.location.search);
  const sharedJob = urlParams.get('job');
  if (sharedJob) {
    try {
      const state = JSON.parse(decodeURIComponent(escape(atob(sharedJob))));

      // ── sanitisers ──
      const clampStr = function(v, max){ return (typeof v === 'string' ? v : '').slice(0, max || 60); };
      const clampNum = function(v, min, max){
        var n = parseFloat(v);
        if (!isFinite(n)) return '';
        if (n < min) n = min; if (n > max) n = max;
        return n;
      };
      const cleanSize = function(s){
        if (!s || typeof s !== 'object') return {w:'',h:'',price:0};
        return {
          w: clampNum(s.w, 0, 100000) || '',
          h: clampNum(s.h, 0, 100000) || '',
          price: clampNum(s.price, 0, 1000000) || 0
        };
      };
      const cleanPieces = function(arr){
        if (!Array.isArray(arr)) return [{w:'',h:'',qty:1,label:''}];
        var out = arr.slice(0, 500).map(function(p){
          return {
            w: clampNum(p && p.w, 0, 100000) || '',
            h: clampNum(p && p.h, 0, 100000) || '',
            qty: clampNum(p && p.qty, 1, 9999) || 1,
            label: clampStr(p && p.label, 40)
          };
        });
        return out.length ? out : [{w:'',h:'',qty:1,label:''}];
      };

      // Both v1 and v2 links carry a `mats` array; we treat them identically and
      // defensively. The legacy v1 `state.lib` (full library bundle) is IGNORED
      // by design — we never replace the user's library from a link.
      const srcMats = Array.isArray(state.mats) ? state.mats.slice(0, 50) : [];
      const newMats = [];
      srcMats.forEach(function(sm, i){
        if (!sm || typeof sm !== 'object') return;
        const libId = 'shared-' + Date.now() + '-' + i;
        library.push({
          id: libId,
          _transient: true,                         // not persisted unless user saves
          name: clampStr(sm.name, 60) || ('Shared material ' + (i+1)),
          material: '', thickness: '', grade: '',
          cuttingMethod: (sm.cuttingMethod === 'guillotine') ? 'guillotine' : 'free',
          allowRotation: sm.allowRotation !== false,
          // v3 links carry sizes[]; v1/v2 links carried size1/size2.
          sizes: cleanSizes(Array.isArray(sm.sizes) ? sm.sizes.slice(0, MAX_SHEET_SIZES) : [cleanSize(sm.size1), cleanSize(sm.size2)])
        });
        newMats.push({
          id: 'mat-' + Date.now() + '-' + i,
          selectedMatId: libId,
          pieces: cleanPieces(sm.pieces)
        });
      });

      if (newMats.length) {
        // Free plan is 1 material per job. A shared link could carry up to 50,
        // and nothing downstream gated on isPro, so opening a link was a free
        // upgrade. Truncate and say why — that sells Pro better than a leak.
        const droppedMats = (!isPro && newMats.length > 1) ? newMats.length - 1 : 0;
        mats = isPro ? newMats : newMats.slice(0, 1);
        const jr = document.getElementById('job-ref'); if (jr) jr.value = clampStr(state.jobRef, 60);
        const jq = document.getElementById('job-qty'); if (jq) jq.value = String(clampNum(state.jobQty, 1, 999) || 1);
        renderAll();
        if (droppedMats) {
          showToast('📋 Shared job loaded — showing 1 of ' + newMats.length + ' materials. Pro nests them all together.', 5200);
          setTimeout(function(){
            showUpgradeModal('📦','This job uses ' + newMats.length + ' materials',
              'Your shared link contains ' + newMats.length + ' materials. The free plan calculates one at a time — Pro nests all of them in a single job and costs them together.');
          }, 900);
        } else {
          showToast('📋 Shared job loaded — review, then save to your library to keep these materials');
        }
      } else {
        restoreState();
      }
      // Always strip the payload from the address bar so a reload can't re-import it.
      window.history.replaceState({}, '', window.location.pathname);
    } catch(e) { restoreState(); }
  } else {
    restoreState();
  }
    updateProUI();
  });
});


// ── DIALOG FOCUS ──────────────────────────────
// Every dialog is opened and closed by flipping style.display, from a dozen
// places. Rather than touch each one, watch the dialogs: on open, move focus
// inside (unless the opener already did) and remember where it came from; on
// close, put it back. Tab and Shift+Tab stay inside the open dialog.
(function () {
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const returnTo = new Map();
  const isOpen = function (el) { return el.style.display !== 'none' && getComputedStyle(el).display !== 'none'; };
  const focusables = function (el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (f) { return f.offsetWidth || f.offsetHeight; });
  };
  const openDialogs = [];

  function watch(dlg) {
    let was = isOpen(dlg);
    new MutationObserver(function () {
      const now = isOpen(dlg);
      if (now === was) return;
      was = now;
      if (now) {
        returnTo.set(dlg, document.activeElement);
        openDialogs.push(dlg);
        setTimeout(function () {
          if (dlg.contains(document.activeElement)) return;
          const f = focusables(dlg);
          if (f.length) f[0].focus();
        }, 0);
      } else {
        const i = openDialogs.indexOf(dlg);
        if (i !== -1) openDialogs.splice(i, 1);
        const back = returnTo.get(dlg);
        returnTo.delete(dlg);
        if (back && document.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
      }
    }).observe(dlg, { attributes: true, attributeFilter: ['style'] });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.overlay[role=dialog]').forEach(watch);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !openDialogs.length) return;
    const dlg = openDialogs[openDialogs.length - 1];
    if (!isOpen(dlg)) return;
    const f = focusables(dlg);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();

// ── SERVICE WORKER: offline support + installable app ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
  });
}
