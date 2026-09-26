// Packing worker. Runs the engine off the main thread so a big job never
// freezes the page. It loads the SAME js/engine.js the page uses.
importScripts('engine.js');

// Globals the engine reads. The page sends the real values with every job.
var KERF = 4, PACK_EFFORT = 8;
var settings = { minOffcutLong: 1000, minOffcutShort: 300 };

self.onmessage = function (e) {
  var d = e.data;
  KERF = d.kerf;
  if (d.settings) settings = d.settings;
  var res = null, err = null, fallback = false;
  try { res = packJob(d.libMat, d.pieces, d.remnant, d.jobQty); }
  catch (ex1) {
    try { res = packJob(d.libMat, d.pieces, d.remnant, d.jobQty, true); fallback = true; }
    catch (ex2) { err = String((ex1 && ex1.message) || ex1); }
  }
  // The website demo asks for the lower bound too, so it can say when a plan
  // is provably optimal without loading the engine on the page itself.
  if (d.bound && res && res.sheets && res.sheets.length && !(res.unplaced && res.unplaced.length) &&
      Object.keys(res.sizeMap || {}).length === 1 && !res.sheets.some(function (s) { return s.isRemnant; })) {
    try {
      var T = res.sheets[0].trim || 0, q = [];
      res.sheets.forEach(function (sh) { sh.placed.forEach(function (p) { q.push({ w: p.w, h: p.h }); }); });
      res.bound = packingLowerBound(q, res.sheets[0].sheetW - 2 * T, res.linear ? res.sheets[0].sheetH : res.sheets[0].sheetH - 2 * T,
                                    res.kerf != null ? res.kerf : KERF, res.allowRotation !== false);
    } catch (e) { /* no badge, no harm */ }
  }
  self.postMessage({ id: d.id, res: res, err: err, fallback: fallback });
};
