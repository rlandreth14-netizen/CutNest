// Real layouts from CutNest's engine for the promo visuals.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { settings: { minOffcutLong: 1000, minOffcutShort: 300, minBarOffcut: 500 } };
vm.createContext(ctx);
vm.runInContext('var KERF = 3, PACK_EFFORT = 8;\n' + fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8') +
  '\nthis.E = { packJob, packingLowerBound }; this.K = function (k) { KERF = k; };', ctx);
function pack(lib, pieces, kerf) {
  ctx.K(kerf);
  const r = ctx.E.packJob(lib, pieces, null, 1);
  return { sheets: r.sheets.map(s => ({ w: s.sheetW, h: s.sheetH, util: s.utilPercent, off: s.offcut ? s.offcut.w : 0, keep: !!s.usableOffcut,
    parts: s.placed.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, i: p.pieceIndex, label: p.label })) })), sizeMap: r.sizeMap };
}
const sheet = (w, h) => ({ id: 1, name: 'x', cuttingMethod: 'free', allowRotation: true, sizes: [{ w, h, price: 0 }] });
const out = {};
out.desk = pack(sheet(2440, 1220), [{ w: 1400, h: 700, qty: 2, label: 'Desk top' }, { w: 720, h: 680, qty: 4, label: 'Leg panel' }, { w: 1300, h: 400, qty: 2, label: 'Modesty' }], 3);
out.metal = pack({ id: 2, name: 'Mild Steel 2mm', cuttingMethod: 'free', allowRotation: true, sizes: [{ w: 2450, h: 1150, price: 105 }] },
  [{ label: 'Cover', w: 600, h: 400, qty: 4 }, { label: 'Bracket', w: 300, h: 200, qty: 10 }, { label: 'Base plate', w: 450, h: 450, qty: 3 }, { label: 'Gusset', w: 150, h: 150, qty: 16 }], 4);
out.kitchen = pack({ id: 3, name: 'MDF', cuttingMethod: 'guillotine', allowRotation: true, sizes: [{ w: 2440, h: 1220, price: 28 }] },
  [{ label: 'Side', w: 720, h: 560, qty: 6 }, { label: 'Base', w: 564, h: 560, qty: 3 }, { label: 'Shelf', w: 564, h: 520, qty: 3 }, { label: 'Rail', w: 564, h: 100, qty: 6 }, { label: 'Door', w: 715, h: 497, qty: 6 }], 4);
out.kerf5 = pack(sheet(2440, 1220), [{ w: 606, h: 300, qty: 16, label: 'Part' }], 5);
out.kerf6 = pack(sheet(2440, 1220), [{ w: 606, h: 300, qty: 16, label: 'Part' }], 6);
out.bar = pack({ id: 4, name: 'SHS', kind: 'linear', kerf: 2, trim: 10, sizes: [{ w: 7500, h: 1, price: 38 }, { w: 6000, h: 1, price: 32 }] },
  [{ label: 'Top rail', w: 2400, qty: 4 }, { label: 'Leg', w: 900, qty: 8 }, { label: 'Brace', w: 650, qty: 6 }], 2);
// Grain: every part locked vs only the doors locked (brushed stainless).
const ss = rot => ({ id: 5, name: 'S/S', cuttingMethod: 'free', allowRotation: rot, sizes: [{ w: 2450, h: 1150, price: 225 }] });
out.grainAll = pack(ss(false), [{ w: 700, h: 500, qty: 4, label: 'Door' }, { w: 1100, h: 400, qty: 6, label: 'Back' }], 4);
out.grainDoors = pack(ss(true), [{ w: 700, h: 500, qty: 4, label: 'Door', grain: 'lock' }, { w: 1100, h: 400, qty: 6, label: 'Back' }], 4);
// Stock mix: full sheets only vs full + half sheets (acrylic).
const acr = sizes => ({ id: 6, name: 'Acrylic', cuttingMethod: 'free', allowRotation: true, sizes });
out.mixFull = pack(acr([{ w: 2440, h: 1220, price: 55 }]), [{ w: 1200, h: 600, qty: 5, label: 'Panel' }], 3);
out.mixBest = pack(acr([{ w: 2440, h: 1220, price: 55 }, { w: 1220, h: 610, price: 30 }]), [{ w: 1200, h: 600, qty: 5, label: 'Panel' }], 3);
fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(out));
for (const k of Object.keys(out)) console.log(k, out[k].sheets.length, JSON.stringify(out[k].sizeMap), out[k].sheets.map(s => s.util + '%').join(' '));
