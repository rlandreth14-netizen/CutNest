// File import tests. Run with: npm test
// js/import.js reads cut lists from CSV/TSV text and from .xlsx files without
// any library. These tests build a real .xlsx (a zip of XML) in memory and
// read it back, and check the CSV and header handling.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');

const ctx = { TextDecoder, TextEncoder, DecompressionStream, Blob, Response, Uint8Array, DataView, console, settings: { units: 'mm' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'units.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '..', 'js', 'import.js'), 'utf8') +
  '\nthis.I = { splitDelimited, detectDelimiter, headerMap, grainCell, readXlsxRows, parseLengthList };', ctx);
const I = ctx.I;

let checks = 0, failures = 0;
function eq(actual, expected, what) {
  checks++;
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`  FAIL ${what}: got ${a}, expected ${e}`); }
}

// ── A minimal .xlsx writer (zip with one deflated and one stored entry) ──
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  files.forEach(function (f, i) {
    const name = Buffer.from(f.name), raw = Buffer.from(f.data);
    const deflate = i % 2 === 0;
    const body = deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + body.length;
  });
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, end]));
}
function sampleXlsx() {
  const shared = ['Part', 'Length', 'Width', 'Qty', 'Grain', 'Door & Frame', 'Shelf'];
  const row = (r, cells) => '<row r="' + r + '">' + cells.join('') + '</row>';
  const s = (ref, i) => '<c r="' + ref + '" t="s"><v>' + i + '</v></c>';
  const n = (ref, v) => '<c r="' + ref + '"><v>' + v + '</v></c>';
  const sheet = '<?xml version="1.0"?><worksheet><sheetData>' +
    row(1, [s('A1', 0), s('B1', 1), s('C1', 2), s('D1', 3), s('E1', 4)]) +
    row(2, [s('A2', 5), n('B2', 800), n('C2', 600), n('D2', 4), '<c r="E2" t="inlineStr"><is><t>Lock</t></is></c>']) +
    row(3, [s('A3', 6), n('B3', 450.5), n('C3', 380), n('D3', 6)]) +
    row(5, [n('B5', 700), n('C5', 280)]) +
    '</sheetData></worksheet>';
  const sst = '<?xml version="1.0"?><sst>' + shared.map(t => '<si><t>' + t.replace(/&/g, '&amp;') + '</t></si>').join('') + '</sst>';
  return zip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="Cuts" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }
  ]);
}

(async function () {
  // CSV cells
  eq(I.splitDelimited('Door, "Front, left", 800,"1,200"', ','), ['Door', 'Front, left', '800', '1,200'], 'quoted CSV cells');
  eq(I.splitDelimited('a\t"say ""hi"""\tb', '\t'), ['a', 'say "hi"', 'b'], 'escaped quotes');
  eq(I.detectDelimiter('a\tb\n1\t2'), '\t', 'tab delimiter');
  eq(I.detectDelimiter('a;b\n1,5;2'), ';', 'semicolon beats comma');
  eq(I.detectDelimiter('600x400x4\n700x300'), null, 'no delimiter');

  // Header rows
  eq(I.headerMap(['Part', 'Length', 'Width', 'Qty']), { w: 1, h: 2, qty: 3, label: 0, grain: undefined }, 'length x width');
  eq(I.headerMap(['Qty', 'Height (mm)', 'Width (mm)', 'Name']), { w: 2, h: 1, qty: 0, label: 3, grain: undefined }, 'any order, units in headings');
  eq(I.headerMap(['Door', '800', '600', '4']), null, 'a data row is not a header');
  eq(I.headerMap(['Colour', 'Finish']), null, 'no dimensions, no header');
  eq([I.grainCell('Lock'), I.grainCell('y'), I.grainCell('Turn'), I.grainCell('no'), I.grainCell('')], ['lock', 'lock', 'free', 'free', undefined], 'grain cells');

  // .xlsx
  const buf = sampleXlsx();
  fs.writeFileSync(path.join(__dirname, 'fixtures', 'cutlist.xlsx'), buf);
  const rows = await I.readXlsxRows(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  eq(rows[0], ['Part', 'Length', 'Width', 'Qty', 'Grain'], 'xlsx header row (shared strings)');
  eq(rows[1], ['Door & Frame', '800', '600', '4', 'Lock'], 'xlsx data row (entities, inline string)');
  eq(rows[2], ['Shelf', '450.5', '380', '6'], 'xlsx decimals');
  eq(rows[3], ['', '700', '280'], 'xlsx gap in columns');

  // ── Length lists for bar stock ──
  const L = function (t) { return JSON.parse(JSON.stringify(I.parseLengthList(t).rows.map(function (r) { return [r.label, r.w, r.qty]; }))); };
  eq(L('1200'), [['', 1200, 1]], 'length only');
  eq(L('1200 4'), [['', 1200, 4]], 'length and qty');
  eq(L('1200 x 4'), [['', 1200, 4]], 'length x qty');
  eq(L('4 off 1200'), [['', 1200, 4]], 'N off length');
  eq(L('Rail 1200 4'), [['Rail', 1200, 4]], 'label length qty');
  eq(L('Rail, 1200, 4\nPost, 450, 3'), [['Rail', 1200, 4], ['Post', 450, 3]], 'comma separated');
  eq(L('2.4m x 6'), [['', 2400, 6]], 'metres');
  eq(L('Top rail, 2400, 4\nLeg 900 x 8\n4 off 1150'), [['Top rail', 2400, 4], ['Leg', 900, 8], ['', 1150, 4]], 'mixed formats in one paste');
  eq(L('Part\tLength\tQty\nTop rail\t1,450\t2'), [['Top rail', 1450, 2]], 'header row, thousands separator');
  eq(L('Qty,Cut length (mm),Name\n3,600,Brace'), [['Brace', 600, 3]], 'header in any order');
  eq(I.parseLengthList('Rail 12ab').errors.length, 1, 'unreadable line reported');
  ctx.settings.units = 'in';
  eq(L('23 5/8 4'), [['', 23.625 * 25.4, 4]], 'inches with a fraction');
  eq(L('8\' 6, 2'), [['', 102 * 25.4, 2]], 'feet and inches');
  ctx.settings.units = 'mm';

  console.log(`import: ${checks} checks, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
