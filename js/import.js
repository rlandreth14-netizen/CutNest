// ════════════════════════════════════════════════════════════════
//  FILE IMPORT — cut lists from CSV / TSV / TXT / Excel (.xlsx)
//  Everything is read in the browser; nothing is uploaded anywhere.
//
//  .xlsx is a zip of XML files. Rather than ship a 900KB spreadsheet
//  library, this reads just what a cut list needs: the first worksheet's
//  cell values. Unzipping uses the browser's own DecompressionStream
//  ('deflate-raw'), available in every current browser and Node 18+.
// ════════════════════════════════════════════════════════════════

// Split one CSV/TSV line into cells, honouring "quoted, cells" and "" escapes.
function splitDelimited(line, delim) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// The delimiter a block of text uses: tab, semicolon or comma (in that order
// of preference, because a comma can also be a thousands separator).
function detectDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 20);
  const count = function (ch) { return lines.filter(function (l) { return l.indexOf(ch) !== -1; }).length; };
  if (count('\t') >= Math.max(1, lines.length / 2)) return '\t';
  if (count(';') >= Math.max(1, lines.length / 2)) return ';';
  if (count(',') >= Math.max(1, lines.length / 2)) return ',';
  return null;
}

// Recognise a header row and say which column holds what. Returns null when
// the row is not a header (it has numbers, or no width/height columns).
// "Length x Width" lists (common in joinery) map length -> W, width -> H.
const HEADER_WORDS = {
  label: /^(label|name|part|part ?name|description|desc|item|component|ref|reference|mark)$/,
  length: /^(length|len|l)$/,
  width: /^(width|w)$/,
  height: /^(height|h|depth|breadth|b|d)$/,
  qty: /^(qty|quantity|count|no\.?|number|pcs|pieces|amount|num|#)$/,
  grain: /^(grain|grain lock|rotate|rotation|can rotate)$/
};
function headerMap(cells) {
  if (!cells || cells.length < 2) return null;
  if (cells.some(function (c) { return /\d/.test(c) && !/^(no\.?|#)$/i.test(c.trim()); })) return null;
  const found = {};
  cells.forEach(function (c, i) {
    const k = String(c).trim().toLowerCase().replace(/\s*\((mm|in|inches|")\)\s*$/, '').replace(/[:*]/g, '').trim();
    Object.keys(HEADER_WORDS).forEach(function (f) { if (found[f] == null && HEADER_WORDS[f].test(k)) found[f] = i; });
  });
  // Two dimension columns out of length / width / height.
  let w, h;
  if (found.length != null && found.width != null) { w = found.length; h = found.width; }
  else if (found.width != null && found.height != null) { w = found.width; h = found.height; }
  else if (found.length != null && found.height != null) { w = found.length; h = found.height; }
  else return null;
  return { w: w, h: h, qty: found.qty, label: found.label, grain: found.grain };
}

// A grain cell: 'lock' / 'free' / undefined. "Lock", "yes", "Y", "1" mean the
// grain matters (never rotate); "free", "turn", "no", "N", "0" mean it may turn.
function grainCell(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return undefined;
  if (/^(lock|locked|l|yes|y|true|1|fixed|grain)$/.test(s)) return 'lock';
  if (/^(free|turn|rotate|r|no|n|false|0|any)$/.test(s)) return 'free';
  return undefined;
}

// ── XLSX ──────────────────────────────────────────────────────────
async function _inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('no-decompress');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Read the entries of a zip file: { name -> async () => Uint8Array }.
function _zipEntries(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not-zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad-zip');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries[name] = (function (method, csize, local) {
      return async function () {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        if (method === 8) return _inflateRaw(data);
        throw new Error('zip-method');
      };
    })(method, csize, local);
    p += 46 + nameLen + extraLen + commLen;
  }
  return entries;
}

function _xmlDecode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
          .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
          .replace(/&amp;/g, '&');
}
// Column letters to index: A -> 0, Z -> 25, AA -> 26.
function _colIndex(ref) {
  const letters = String(ref).replace(/\d+/g, '');
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

// Rows of cell text from the first worksheet of an .xlsx file.
async function readXlsxRows(buf) {
  const zip = _zipEntries(buf);
  const text = async function (name) { const f = zip[name]; return f ? new TextDecoder().decode(await f()) : null; };
  // First sheet listed in the workbook, via its relationship id.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await text('xl/workbook.xml'), rels = await text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
    if (first) {
      const rel = new RegExp('<Relationship\\b[^>]*\\bId="' + first[1] + '"[^>]*\\bTarget="([^"]+)"').exec(rels) ||
                  new RegExp('<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="' + first[1] + '"').exec(rels);
      if (rel) sheetPath = rel[1].replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/');
    }
  }
  const shared = [];
  const ss = await text('xl/sharedStrings.xml');
  if (ss) {
    (ss.match(/<si\b[\s\S]*?<\/si>/g) || []).forEach(function (si) {
      shared.push(_xmlDecode((si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) {
        return t.replace(/<t\b[^>]*>/, '').replace(/<\/t>$/, '');
      }).join('')));
    });
  }
  const sheet = await text(sheetPath);
  if (!sheet) throw new Error('no-sheet');
  const rows = [];
  (sheet.match(/<row\b[\s\S]*?<\/row>/g) || []).forEach(function (row) {
    const cells = [];
    (row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (c) {
      const ref = (c.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (c.match(/\bt="(\w+)"/) || [])[1];
      let val = '';
      if (type === 'inlineStr') {
        val = _xmlDecode((c.match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
      } else {
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v != null) val = type === 's' ? (shared[+v] || '') : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : _xmlDecode(v);
      }
      cells[ref ? _colIndex(ref) : cells.length] = val;
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
    rows.push(cells);
  });
  return rows;
}

// Turn a chosen file into text the cut-list parser reads (tab-separated for
// spreadsheets). Throws an Error with a user-facing message.
async function fileToCutListText(file) {
  const name = (file && file.name || '').toLowerCase();
  if (/\.xlsx$|\.xlsm$/.test(name)) {
    let rows;
    try { rows = await readXlsxRows(await file.arrayBuffer()); }
    catch (e) {
      throw new Error(e && e.message === 'no-decompress'
        ? 'This browser cannot open Excel files. In Excel, use File > Save As > CSV and choose that instead.'
        : 'That Excel file could not be read. In Excel, use File > Save As > CSV and try that.');
    }
    return rows.map(function (r) { return r.map(function (c) { return String(c).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\n');
  }
  if (/\.xls$|\.numbers$|\.ods$/.test(name)) {
    throw new Error('Save the spreadsheet as CSV or .xlsx first (File > Save As), then choose that file.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('That file is over 5MB, which is far bigger than any cut list.');
  return await file.text();
}
