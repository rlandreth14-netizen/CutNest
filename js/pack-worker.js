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
  self.postMessage({ id: d.id, res: res, err: err, fallback: fallback });
};
