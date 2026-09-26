// ════════════════════════════════════════════════════════════════
//  LIVE DEMO — the real CutNest engine on the website
//  Any <div class="cn-demo" data-preset="metal|kitchen|bar|signs"> becomes a
//  small working cut list: pick a sample job, change the parts, calculate.
//  Packing runs in the same worker the app uses (js/pack-worker.js, which
//  loads js/engine.js), so what visitors see is exactly what the app does.
//  "Open in the app" carries the job over as a normal share link.
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var PRESETS = {
    metal: {
      tab: 'Sheet metal', kerf: 4,
      mat: { name: 'Mild Steel 2mm', thickness: '2mm', cuttingMethod: 'free', allowRotation: true,
             sizes: [{ w: 2450, h: 1150, price: 105 }, { w: 2050, h: 900, price: 65 }] },
      pieces: [{ label: 'Cover', w: 600, h: 400, qty: 4 }, { label: 'Bracket', w: 300, h: 200, qty: 10 },
               { label: 'Base plate', w: 450, h: 450, qty: 3 }, { label: 'Gusset', w: 150, h: 150, qty: 16 }]
    },
    kitchen: {
      tab: 'Kitchen carcasses', kerf: 4,
      mat: { name: 'MDF 18mm', thickness: '18mm', cuttingMethod: 'guillotine', allowRotation: true,
             sizes: [{ w: 2440, h: 1220, price: 28 }] },
      pieces: [{ label: 'Side', w: 720, h: 560, qty: 6 }, { label: 'Base', w: 564, h: 560, qty: 3 },
               { label: 'Shelf', w: 564, h: 520, qty: 3 }, { label: 'Rail', w: 564, h: 100, qty: 6 }]
    },
    bar: {
      tab: 'Bar & tube', kerf: 2, linear: true,
      mat: { name: 'SHS 40x40x3', thickness: '40x40x3', kind: 'linear', kerf: 2, cuttingMethod: 'free', allowRotation: false,
             sizes: [{ w: 7500, h: 1, price: 38 }, { w: 6000, h: 1, price: 32 }] },
      pieces: [{ label: 'Top rail', w: 2400, qty: 4 }, { label: 'Leg', w: 900, qty: 8 }, { label: 'Brace', w: 650, qty: 6 }]
    },
    signs: {
      tab: 'Signs & acrylic', kerf: 3,
      mat: { name: 'Acrylic 3mm Clear', thickness: '3mm', cuttingMethod: 'free', allowRotation: true,
             sizes: [{ w: 2440, h: 1220, price: 55 }, { w: 1220, h: 610, price: 30 }] },
      pieces: [{ label: 'Panel', w: 1200, h: 600, qty: 1 }, { label: 'Plaque', w: 300, h: 200, qty: 8 },
               { label: 'Stand-off tray', w: 500, h: 350, qty: 3 }]
    }
  };
  // Custom: the visitor's own sheet size and kerf (the "how many sheets" guide).
  PRESETS.custom = {
    tab: 'Your job', kerf: 3, custom: true,
    mat: { name: 'Your sheet', cuttingMethod: 'free', allowRotation: true, sizes: [{ w: 2440, h: 1220, price: 0 }] },
    pieces: [{ label: 'Desk top', w: 1400, h: 700, qty: 2 }, { label: 'Leg panel', w: 720, h: 680, qty: 4 }, { label: 'Modesty panel', w: 1300, h: 400, qty: 2 }]
  };
  var ORDER = ['metal', 'kitchen', 'bar', 'signs'];
  var COLORS = ['#1a6bbf', '#0c9e6a', '#e8960a', '#c03050', '#7c4ddb', '#d9600a', '#0891b2', '#65a30d'];
  var MAX_ROWS = 8, MAX_QTY = 40;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { var n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }
  function money(n) { return '£' + (Math.round(n * 100) / 100).toFixed(2); }
  function mm(n) { return (Math.round(n * 10) / 10) + 'mm'; }

  // One worker for every demo on the page, created on first use.
  var worker = null, seq = 0, waiting = {};
  function pack(preset, pieces) {
    return new Promise(function (resolve) {
      if (typeof Worker === 'undefined') return resolve({ err: 'This browser cannot run the demo — open the app instead.' });
      if (!worker) {
        try {
          worker = new Worker('/js/pack-worker.js');
          worker.onmessage = function (e) { var cb = waiting[e.data.id]; if (cb) { delete waiting[e.data.id]; cb(e.data); } };
          worker.onerror = function () { Object.keys(waiting).forEach(function (k) { waiting[k]({ err: 'The demo could not run here — open the app instead.' }); delete waiting[k]; }); worker = null; };
        } catch (e) { return resolve({ err: 'The demo could not start — open the app instead.' }); }
      }
      var id = ++seq;
      waiting[id] = resolve;
      worker.postMessage({ id: id, kerf: preset.kerf, bound: true,
        settings: { minOffcutLong: 1000, minOffcutShort: 300, minBarOffcut: 500 },
        libMat: preset.mat, pieces: pieces, remnant: null, jobQty: 1 });
    });
  }

  function mount(root) {
    var key = PRESETS[root.getAttribute('data-preset')] ? root.getAttribute('data-preset') : 'metal';
    var only = root.hasAttribute('data-only');           // trade pages show their own job only
    var state = { key: key, rows: [] };
    root.classList.add('cnd');
    root.innerHTML =
      (only ? '' : '<div class="cnd-tabs" role="tablist" aria-label="Sample jobs">' + ORDER.map(function (k) {
        return '<button type="button" role="tab" class="cnd-tab" data-k="' + k + '">' + esc(PRESETS[k].tab) + '</button>';
      }).join('') + '</div>') +
      '<div class="cnd-body">' +
        '<div class="cnd-in">' +
          '<div class="cnd-mat"></div>' +
          '<table class="cnd-tbl"><thead></thead><tbody></tbody></table>' +
          '<div class="cnd-acts"><button type="button" class="cnd-add">+ Add a part</button>' +
          '<button type="button" class="cnd-go">✂ Calculate</button></div>' +
          '<p class="cnd-note">Change any size or quantity. This is the real CutNest engine, running in your browser.</p>' +
        '</div>' +
        '<div class="cnd-out" aria-live="polite"></div>' +
      '</div>';

    var tbody = root.querySelector('tbody'), thead = root.querySelector('thead'), out = root.querySelector('.cnd-out');

    function load(k) {
      state.key = k;
      var p = PRESETS[k];
      state.rows = p.pieces.map(function (r) { return { label: r.label, w: r.w, h: r.h || '', qty: r.qty }; });
      root.querySelectorAll('.cnd-tab').forEach(function (b) {
        var on = b.getAttribute('data-k') === k;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var sizes = p.mat.sizes.map(function (z) { return (p.linear ? mm(z.w) : z.w + '×' + z.h + 'mm') + ' @ ' + money(z.price); }).join(' · ');
      root.querySelector('.cnd-mat').innerHTML = p.custom
        ? '<div class="cnd-sheet"><label>Sheet width<input data-s="w" inputmode="decimal" value="' + p.mat.sizes[0].w + '"/></label>' +
          '<label>Sheet height<input data-s="h" inputmode="decimal" value="' + p.mat.sizes[0].h + '"/></label>' +
          '<label>Kerf (mm)<input data-s="k" inputmode="decimal" value="' + p.kerf + '"/></label></div>'
        : '<b>' + esc(p.mat.name) + '</b> <span>' + esc(sizes) + ' \u00b7 kerf ' + p.kerf + 'mm' +
          (p.mat.cuttingMethod === 'guillotine' ? ' \u00b7 saw cuts' : '') + '</span>';
      draw();
      run();
    }
    function draw() {
      var lin = !!PRESETS[state.key].linear;
      thead.innerHTML = '<tr><th>Part</th><th>' + (lin ? 'Length' : 'W') + '</th>' + (lin ? '' : '<th>H</th>') + '<th>Qty</th><th></th></tr>';
      tbody.innerHTML = state.rows.map(function (r, i) {
        return '<tr>' +
          '<td><input aria-label="Part ' + (i + 1) + ' name" data-i="' + i + '" data-f="label" value="' + esc(r.label) + '" maxlength="24"/></td>' +
          '<td><input aria-label="Part ' + (i + 1) + (lin ? ' length' : ' width') + ' in mm" inputmode="decimal" data-i="' + i + '" data-f="w" value="' + esc(r.w) + '"/></td>' +
          (lin ? '' : '<td><input aria-label="Part ' + (i + 1) + ' height in mm" inputmode="decimal" data-i="' + i + '" data-f="h" value="' + esc(r.h) + '"/></td>') +
          '<td><input aria-label="Part ' + (i + 1) + ' quantity" inputmode="numeric" data-i="' + i + '" data-f="qty" value="' + esc(r.qty) + '"/></td>' +
          '<td><button type="button" class="cnd-x" data-del="' + i + '" aria-label="Remove part ' + (i + 1) + '">✕</button></td></tr>';
      }).join('');
      root.querySelector('.cnd-add').disabled = state.rows.length >= MAX_ROWS;
    }
    function pieces() {
      var lin = !!PRESETS[state.key].linear;
      return state.rows.map(function (r) {
        return { label: String(r.label || '').slice(0, 24), w: num(r.w), h: lin ? 1 : num(r.h), qty: Math.max(1, Math.min(MAX_QTY, Math.round(num(r.qty)) || 1)) };
      }).filter(function (p) { return p.w > 0 && p.h > 0; });
    }

    function run() {
      var p = PRESETS[state.key], ps = pieces();
      if (!ps.length) { out.innerHTML = '<div class="cnd-msg">Add a part with a size to calculate.</div>'; return; }
      // Parts that cannot fit any stock size are reported, not sent to the packer.
      var maxW = 0, maxH = 0;
      p.mat.sizes.forEach(function (z) { maxW = Math.max(maxW, z.w); maxH = Math.max(maxH, z.h); });
      var tooBig = ps.filter(function (q) { return p.linear ? q.w > maxW : !((q.w <= maxW && q.h <= maxH) || (q.h <= maxW && q.w <= maxH)); });
      if (tooBig.length) { out.innerHTML = '<div class="cnd-msg">“' + esc(tooBig[0].label || 'A part') + '” is bigger than the largest ' + (p.linear ? 'bar' : 'sheet') + '. Make it smaller to calculate.</div>'; return; }
      out.classList.add('busy');
      var t0 = Date.now();
      pack(p, ps).then(function (msg) {
        out.classList.remove('busy');
        if (msg.err || !msg.res) { out.innerHTML = '<div class="cnd-msg">' + esc(msg.err || 'Something went wrong') + '</div>'; return; }
        show(p, ps, msg.res, Date.now() - t0);
        if (typeof cnTrack === 'function') cnTrack('demo_run', { preset: state.key, parts: ps.reduce(function (a, q) { return a + q.qty; }, 0) });
      });
    }

    function show(p, ps, res, ms) {
      var lin = !!p.linear, n = res.sheets.length;
      var cost = 0, used = 0, stock = 0;
      res.sheets.forEach(function (sh) {
        var z = p.mat.sizes.filter(function (s) { return s.w === sh.sheetW && s.h === sh.sheetH; })[0];
        if (z) cost += z.price;
        sh.placed.forEach(function (q) { used += q.w * q.h; });
        stock += sh.sheetW * sh.sheetH;
      });
      var util = stock ? Math.round(used / stock * 100) : 0;
      var order = Object.keys(res.sizeMap || {}).map(function (k) {
        var wh = k.split('×');
        return res.sizeMap[k] + ' × ' + (lin ? mm(+wh[0]) : wh[0] + '×' + wh[1] + 'mm');
      }).join(' + ');
      var optimal = res.bound && n <= res.bound;
      var word = lin ? (n === 1 ? 'bar' : 'bars') : (n === 1 ? 'sheet' : 'sheets');
      var compare = '';
      if (root.hasAttribute('data-compare') && !lin) {
        // What a plain "total area / sheet area" sum would have said.
        var z0 = p.mat.sizes[0], area = 0;
        ps.forEach(function (q) { area += q.w * q.h * q.qty; });
        var est = Math.ceil(area / (z0.w * z0.h) - 1e-9);
        compare = '<div class="cnd-cmp">Area estimate: <b>' + est + '</b> \u00b7 real nest: <b>' + n + '</b>' +
          (n > est ? ' \u2014 the area sum would have left you <b>' + (n - est) + ' ' + (n - est === 1 ? 'sheet' : 'sheets') + ' short</b>.' : ' \u2014 this time the estimate was right.') + '</div>';
      }
      var html = '<div class="cnd-head"><div class="cnd-n">' + n + '<span>' + word + '</span></div>' +
        '<div class="cnd-facts"><div><b>' + esc(order) + '</b></div><div>' + (cost ? money(cost) + ' of material \u00b7 ' : '') + util + '% used · ' + (ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's') + '</div>' +
        compare + (optimal ? '<div class="cnd-opt">✓ Provably optimal — no layout can use fewer ' + (lin ? 'bars' : 'sheets') + '</div>' : '') + '</div></div>';
      var shown = res.sheets.slice(0, lin ? 6 : 4);
      html += '<div class="cnd-sheets' + (lin ? ' lin' : '') + (shown.length === 1 ? ' one' : '') + '">' + shown.map(function (sh, i) { return lin ? barSvg(sh, i) : sheetSvg(sh, i); }).join('') + '</div>';
      if (res.sheets.length > shown.length) html += '<div class="cnd-more">+ ' + (res.sheets.length - shown.length) + ' more ' + (lin ? 'bars' : 'sheets') + ' in the full plan</div>';
      html += '<a class="cnd-open" href="' + esc(appLink(p, ps)) + '" data-placement="demo">Open this job in the app →</a>';
      out.innerHTML = html;
      out.querySelector('.cnd-open').addEventListener('click', function () { if (typeof cnTrack === 'function') cnTrack('demo_open_app', { preset: state.key }); });
    }

    function sheetSvg(sh, i) {
      var W = sh.sheetW, H = sh.sheetH;
      var rects = sh.placed.map(function (q) {
        var c = COLORS[q.pieceIndex % COLORS.length];
        var big = q.w > W * 0.14 && q.h > H * 0.1;
        return '<g><rect x="' + q.x + '" y="' + q.y + '" width="' + q.w + '" height="' + q.h + '" fill="' + c + '" fill-opacity=".85" stroke="' + c + '" stroke-width="6"><title>' + esc((q.label || 'Part') + ' ' + q.w + '×' + q.h) + '</title></rect>' +
          (big ? '<text x="' + (q.x + q.w / 2) + '" y="' + (q.y + q.h / 2) + '" font-size="' + Math.min(q.h * 0.28, q.w * 0.16, 70) + '" text-anchor="middle" dominant-baseline="middle" fill="#fff">' + esc(q.label || '') + '</text>' : '') + '</g>';
      }).join('');
      var off = sh.usableOffcut ? '<rect x="' + sh.usableOffcut.x + '" y="' + sh.usableOffcut.y + '" width="' + sh.usableOffcut.w + '" height="' + sh.usableOffcut.h + '" fill="url(#cndk)" stroke="#059669" stroke-width="6" stroke-dasharray="24 14"/>' : '';
      return '<figure><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sheet ' + (i + 1) + ' layout">' +
        '<defs><pattern id="cndk" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="#d1fae5"/><rect width="20" height="40" fill="#a7f3d0"/></pattern></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="#eef5f7" stroke="#9dcad6" stroke-width="10"/>' + off + rects + '</svg>' +
        '<figcaption>Sheet ' + (i + 1) + ' · ' + W + '×' + H + ' · ' + (sh.utilPercent || 0) + '%</figcaption></figure>';
    }
    function barSvg(sh, i) {
      var L = sh.sheetW, H = L / 22;
      var parts = sh.placed.map(function (q) {
        var c = COLORS[q.pieceIndex % COLORS.length];
        return '<rect x="' + q.x + '" y="0" width="' + q.w + '" height="' + H + '" fill="' + c + '" fill-opacity=".85" stroke="#fff" stroke-width="' + (L / 400) + '"><title>' + esc((q.label || 'Part') + ' ' + q.w + 'mm') + '</title></rect>' +
          (q.w > L * 0.09 ? '<text x="' + (q.x + q.w / 2) + '" y="' + (H / 2) + '" font-size="' + (H * 0.42) + '" text-anchor="middle" dominant-baseline="middle" fill="#fff">' + q.w + '</text>' : '');
      }).join('');
      var off = sh.offcut ? '<rect x="' + sh.offcut.x + '" y="0" width="' + sh.offcut.w + '" height="' + H + '" fill="' + (sh.usableOffcut ? '#a7f3d0' : '#e5e7eb') + '"/>' : '';
      return '<figure><svg viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Bar ' + (i + 1) + ' cutting plan"><rect width="' + L + '" height="' + H + '" fill="#eef5f7"/>' + off + parts + '</svg>' +
        '<figcaption>Bar ' + (i + 1) + ' · ' + mm(L) + (sh.offcut ? ' · ' + (sh.usableOffcut ? 'keep ' : 'offcut ') + mm(sh.offcut.w) : '') + '</figcaption></figure>';
    }

    // The same link format as the app's Share button (v3), so the app opens it
    // as a normal shared job: materials are added for this session only.
    function appLink(p, ps) {
      var m = p.mat;
      var state2 = { v: 3, jobRef: 'Demo — ' + p.tab, jobQty: '1', mats: [{
        name: m.name, kind: m.kind, kerf: m.kerf, cuttingMethod: m.cuttingMethod, allowRotation: m.allowRotation,
        sizes: m.sizes, trim: 0,
        pieces: ps.map(function (q) { return p.linear ? { w: q.w, h: '', qty: q.qty, label: q.label } : { w: q.w, h: q.h, qty: q.qty, label: q.label }; })
      }] };
      var json = JSON.stringify(state2);
      var b64 = btoa(unescape(encodeURIComponent(json)));
      return '/app.html?job=' + encodeURIComponent(b64);
    }

    root.addEventListener('input', function (e) {
      var t = e.target, sk = t.getAttribute('data-s');
      if (sk) {                                          // custom sheet size / kerf
        var P = PRESETS[state.key], v = num(t.value);
        if (sk === 'k') P.kerf = Math.min(50, v); else if (v > 0) P.mat.sizes[0][sk] = Math.min(20000, v);
        return;
      }
      var i = +t.getAttribute('data-i'), f = t.getAttribute('data-f');
      if (!f || !state.rows[i]) return;
      state.rows[i][f] = t.value;
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); run(); } });
    root.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.classList.contains('cnd-tab')) load(t.getAttribute('data-k'));
      else if (t.classList.contains('cnd-go')) run();
      else if (t.classList.contains('cnd-add')) {
        if (state.rows.length < MAX_ROWS) { state.rows.push({ label: 'Part ' + (state.rows.length + 1), w: '', h: '', qty: 1 }); draw(); var ins = tbody.querySelectorAll('tr:last-child input'); if (ins[1]) ins[1].focus(); }
      } else if (t.hasAttribute('data-del')) {
        state.rows.splice(+t.getAttribute('data-del'), 1); draw(); run();
      }
    });

    load(key);
  }

  function init() { document.querySelectorAll('.cn-demo').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
