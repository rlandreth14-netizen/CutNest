// ════════════════════════════════════════════════════════════════
//  CUTNEST PACKING ENGINE
//  Pure computation: no DOM, no storage, no UI. Depends only on the
//  globals KERF, PACK_EFFORT and settings.
//
//  Kept in its own file for two reasons:
//   1. The boundary is enforced by construction rather than by convention:
//      UI code cannot end up in here by accident.
//   2. The page (js/app.js) and the packing worker (js/pack-worker.js) both
//      load THIS file, so they run the same source. There is no second copy
//      to drift. tests/engine.test.js loads it too.
// ════════════════════════════════════════════════════════════════

function rectIntersects(a, b) {
  return !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);
}

// ── THE KERF INVARIANT ────────────────────────────────────────
// The single rule the entire product rests on: a part fits a free rectangle
// only if there is room for the part PLUS a blade's width of waste on any side
// that is not already the sheet edge (you cut along the sheet boundary, not
// between two parts, so no kerf is needed there).
//
// This lived in two hand-copied places — maxRectsPack and packOpenSheets —
// which had to stay byte-identical forever or the two packers would disagree
// about what fits. One definition now, used by both.
function fitsWithKerf(r, pw, ph, sheetW, sheetH) {
  const rRight = r.x + r.w, rBottom = r.y + r.h;
  const needW = pw + (rRight  >= sheetW - 0.0001 ? 0 : KERF);
  const needH = ph + (rBottom >= sheetH - 0.0001 ? 0 : KERF);
  return needW <= r.w && needH <= r.h;
}

// Identity of one physical part instance. Was written out by hand in 10 places.
function pieceKey(p) { return p.pieceIndex + '-' + p.instanceIndex; }

// Piece orderings tried by every packer. Was copy-pasted as a literal 8 times.
const PACK_SORTERS = [
  function(q){ return [...q].sort(function(a,b){ return b.w*b.h - a.w*a.h; }); },
  function(q){ return [...q].sort(function(a,b){ return Math.max(b.w,b.h) - Math.max(a.w,a.h); }); },
  function(q){ return [...q].sort(function(a,b){ return Math.min(b.w,b.h) - Math.min(a.w,a.h); }); },
  function(q){ return [...q].sort(function(a,b){ return b.w - a.w; }); },
  function(q){ return [...q].sort(function(a,b){ return b.h - a.h; }); },
  function(q){ return [...q].sort(function(a,b){ return (b.w+b.h) - (a.w+a.h); }); },
  function(q){ return [...q].sort(function(a,b){ return Math.abs(b.w-b.h) - Math.abs(a.w-a.h); }); },
  function(q){ return [...q].sort(function(a,b){ return Math.abs(a.w-a.h) - Math.abs(b.w-b.h); }); }
];

// Sheets the user actually has to BUY, and what they cost. Re-derived
// independently in renderOutput, exportPDF, exportCSV and buildCutSheetsHtml —
// which is exactly how the remnant once got billed as a bought sheet.
function boughtSheets(sheets) {
  return (sheets || []).filter(function(s){ return !s.isRemnant; });
}

function splitFreeRect(fr, px, py, pw, ph) {
  // Split a free rect around a placed piece — produces up to 4 new free rects
  const res = [];
  if (px > fr.x)
    res.push({x:fr.x, y:fr.y, w:px-fr.x, h:fr.h});
  if (px+pw < fr.x+fr.w)
    res.push({x:px+pw, y:fr.y, w:(fr.x+fr.w)-(px+pw), h:fr.h});
  if (py > fr.y)
    res.push({x:fr.x, y:fr.y, w:fr.w, h:py-fr.y});
  if (py+ph < fr.y+fr.h)
    res.push({x:fr.x, y:py+ph, w:fr.w, h:(fr.y+fr.h)-(py+ph)});
  return res;
}

function pruneFreeRects(rects) {
  // Remove any rect fully contained within another
  return rects.filter((r, i) =>
    r.w > 0 && r.h > 0 &&
    !rects.some((s, j) => j !== i &&
      s.x <= r.x && s.y <= r.y &&
      s.x+s.w >= r.x+r.w && s.y+s.h >= r.y+r.h)
  );
}

// ── LARGEST USABLE OFFCUT ────────────────────────────────────
// Finds the single biggest empty rectangle remaining on a sheet after
// all pieces are placed. This is the offcut a fabricator could realistically
// reclaim and put back on the rack — unlike raw "waste %" which counts every
// fragmented gap.
//
// The candidate edges split the sheet into a grid of cells, each either wholly
// free or wholly blocked. The search runs the "largest rectangle in a
// histogram" sweep over that grid: O(cells) rather than the old brute force
// over every pair of X edges and every pair of Y edges, which was O(parts^5)
// and took minutes on a sheet of a few hundred small parts. Worse, that ran
// past the worker timeout and was then re-run on the main thread, freezing
// the tab. Same answer, including ties: among equal-area rectangles it picks
// the lowest (left, right, top, bottom) edge index, which is the one the
// brute-force loop order used to find first.
function largestEmptyRect(sheetW, sheetH, placed) {
  if (!placed.length) return { x:0, y:0, w:sheetW, h:sheetH, area:sheetW*sheetH };

  // Treat each placed piece as a blocker, with a full blade-kerf moat on ALL
  // FOUR sides. Previously the moat was only added to the right and bottom, so
  // an offcut lying to a part's LEFT or ABOVE it was reported KERF mm too wide
  // or too tall — 20mm out on a turret punch — and could be labelled "usable"
  // when the real cut leaves it just under the threshold.
  const blocks = placed.map(function(p){
    return { x:p.x - KERF, y:p.y - KERF, w:p.w + 2*KERF, h:p.h + 2*KERF };
  });

  // Candidate left/right (X) and top/bottom (Y) edges
  const xs = [0, sheetW];
  const ys = [0, sheetH];
  blocks.forEach(function(b){
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  });
  const xsU = Array.from(new Set(xs)).filter(function(v){return v>=0 && v<=sheetW;}).sort(function(a,b){return a-b;});
  const ysU = Array.from(new Set(ys)).filter(function(v){return v>=0 && v<=sheetH;}).sort(function(a,b){return a-b;});

  // Mark blocked cells. Every block edge (clipped to the sheet) is a grid line,
  // so each block covers a whole number of cells.
  const C = xsU.length - 1, R = ysU.length - 1;
  const xIdx = new Map(), yIdx = new Map();
  xsU.forEach(function(v, i){ xIdx.set(v, i); });
  ysU.forEach(function(v, i){ yIdx.set(v, i); });
  const blocked = new Uint8Array(C * R);
  blocks.forEach(function(b){
    const x0 = xIdx.get(Math.max(0, b.x)), x1 = xIdx.get(Math.min(sheetW, b.x + b.w));
    const y0 = yIdx.get(Math.max(0, b.y)), y1 = yIdx.get(Math.min(sheetH, b.y + b.h));
    if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) return;
    for (let r = y0; r < y1; r++) blocked.fill(1, r * C + x0, r * C + x1);
  });

  // top[c] = first row of the free run in column c that ends at the current
  // row (r + 1 when the cell is blocked). A smaller top means a taller bar, so
  // bar heights are compared by index and every width/height is an exact
  // difference of two edges, as in the old search.
  const top = new Int32Array(C);
  const stack = new Int32Array(C + 1);
  let best = { x:0, y:0, w:0, h:0, area:0 };
  let bk = null;   // edge indices [left, right, top, bottom] of `best`
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) if (blocked[r * C + c]) top[c] = r + 1;
    let sp = 0;
    for (let c = 0; c <= C; c++) {
      const tc = c < C ? top[c] : r + 1;          // sentinel bar of height 0
      while (sp > 0 && top[stack[sp - 1]] <= tc) {
        const tk = top[stack[--sp]];
        if (tk > r) continue;                     // zero-height bar
        const left = sp > 0 ? stack[sp - 1] + 1 : 0;
        const rw = xsU[c] - xsU[left], rh = ysU[r + 1] - ysU[tk];
        const area = rw * rh;
        if (area < best.area || area <= 0) continue;
        if (area === best.area && bk &&
            (left > bk[0] || (left === bk[0] && (c > bk[1] || (c === bk[1] &&
            (tk > bk[2] || (tk === bk[2] && r + 1 >= bk[3]))))))) continue;
        best = { x:xsU[left], y:ysU[tk], w:rw, h:rh, area:area };
        bk = [left, c, tk, r + 1];
      }
      stack[sp++] = c;
    }
  }
  return best;
}

// Decide if an offcut is big enough to count as reclaimable stock.
// A leftover is worth keeping if it's not a thin sliver (its SHORT side clears
// a minimum) AND it has enough total area to be useful. This is closer to how a
// fabricator actually judges reclaim than a strict long-AND-short rule, which
// wrongly binned useful pieces like 730×900 (fails a 1000 long-side test) or
// 1260×280 (fails a 300 short-side test by 20mm). The long-side setting now
// drives the area floor (minLong × minShort) so the existing Settings controls
// still tune behaviour intuitively: raise either to keep fewer, bigger offcuts.
function isUsableOffcut(rect) {
  if (!rect || rect.w<=0 || rect.h<=0) return false;
  // Use != null, not ||: a user who deliberately sets the threshold to 0 was
  // silently given the 1000/300 defaults back.
  const minL = (settings && settings.minOffcutLong  != null) ? +settings.minOffcutLong  : 1000;
  const minS = (settings && settings.minOffcutShort != null) ? +settings.minOffcutShort : 300;
  const longSide  = Math.max(rect.w, rect.h);
  const shortSide = Math.min(rect.w, rect.h);
  const minArea = minL * minS;          // e.g. 1000 × 300 = 0.3 m²
  // Keep it if the short side is usable AND (it clears the long-side bar OR it
  // has enough area to be worth reclaiming as a panel).
  return shortSide >= minS && (longSide >= minL || longSide * shortSide >= minArea);
}

// GUILLOTINE PACKING — for saws and guillotine shears
function guillotinePack(sheetW, sheetH, queue, allowRotation) {
  const placed = [], rem = queue.slice(), free = [{x:0,y:0,w:sheetW,h:sheetH}];
  let improved = true;
  while (improved && rem.length > 0) {
    improved = false;
    let bs = Infinity, bi = -1, bj = -1, bfit = null;
    const tried = new Set();
    for (let i = 0; i < rem.length; i++) {
      const pc = rem[i];
      // Pieces of the same size score identically and only a strictly better
      // score wins, so only the first one of each size can ever be picked.
      const dk = pc.w + 'x' + pc.h;
      if (tried.has(dk)) continue;
      tried.add(dk);
      const orients = [{pw:pc.w,ph:pc.h,rot:false}];
      if (allowRotation && pc.w !== pc.h) orients.push({pw:pc.h,ph:pc.w,rot:true});
      for (let oi = 0; oi < orients.length; oi++) {
        const pw = orients[oi].pw, ph = orients[oi].ph, rot = orients[oi].rot;
        for (let j = 0; j < free.length; j++) {
          const r = free[j];
          if (pw <= r.w && ph <= r.h) {
            const score = r.w * r.h - pw * ph;
            if (score < bs) { bs = score; bi = i; bj = j; bfit = {x:r.x,y:r.y,pw:pw,ph:ph,rot:rot}; }
          }
        }
      }
    }
    if (bi === -1) break;
    const pc2 = rem[bi];
    const x = bfit.x, y = bfit.y, pw = bfit.pw, ph = bfit.ph, rot = bfit.rot;
    placed.push({x:x,y:y,w:pw,h:ph,label:pc2.label,pieceIndex:pc2.pieceIndex,instanceIndex:pc2.instanceIndex,rotated:rot});
    rem.splice(bi, 1);
    improved = true;
    const used = free.splice(bj, 1)[0];
    const rw = used.w - pw - KERF, th = used.h - ph - KERF;
    // Guillotine split choice: after seating the piece top-left in `used`, we can
    // make the first full-width/height cut either vertically or horizontally.
    //  Split V (vertical first): right offcut = rw×used.h, top offcut = pw×th
    //  Split H (horizontal first): top offcut = used.w×th, right offcut = rw×ph
    // Pick whichever leaves the larger single usable offcut (better for big parts
    // later). Conservation/no-overlap is identical either way (proven by tests).
    const vRight = rw > 0 ? rw * used.h : 0, vTop = th > 0 ? pw * th : 0;
    const hTop   = th > 0 ? used.w * th : 0, hRight = rw > 0 ? rw * ph : 0;
    if (Math.max(hTop, hRight) >= Math.max(vRight, vTop)) {
      if (th > 0) free.push({x:used.x, y:y+ph+KERF, w:used.w, h:th});
      if (rw > 0) free.push({x:x+pw+KERF, y:used.y, w:rw, h:ph});
    } else {
      if (rw > 0) free.push({x:x+pw+KERF, y:used.y, w:rw, h:used.h});
      if (th > 0) free.push({x:used.x, y:y+ph+KERF, w:pw, h:th});
    }
  }
  const area = placed.reduce(function(s,p){return s+p.w*p.h;},0);
  return {placed:placed, unplaced:rem, wastePercent:Math.round((1-area/(sheetW*sheetH))*100), sheetW:sheetW, sheetH:sheetH};
}

function guillotinePackBest(sheetW, sheetH, queue, allowRotation) {
  // Guillotine uses a deliberate SUBSET of the shared orderings, in this order:
  // area, longest side, widest, tallest, perimeter. The two "squareness"
  // orderings are omitted — they do not help a saw that cuts edge to edge.
  const sorters = [0, 1, 3, 4, 5].map(function(i){ return PACK_SORTERS[i]; });
  let best = null;
  for (const sortFn of sorters) {
    const res = guillotinePack(sheetW, sheetH, sortFn(queue), allowRotation);
    if (!best || res.placed.length > best.placed.length ||
        (res.placed.length === best.placed.length && res.wastePercent < best.wastePercent))
      best = res;
  }
  return best;
}

function maxRectsPack(sheetW, sheetH, queue, allowRot) {
  const allowRotation = allowRot !== false;
  const placed = [];
  let rem = [...queue];
  let free = [{x:0, y:0, w:sheetW, h:sheetH}];

  let improved = true;
  while (improved && rem.length > 0) {
    improved = false;
    let bestScore = Infinity, bestI = -1, bestFit = null;
    const tried = new Set();

    for (let i = 0; i < rem.length; i++) {
      const pc = rem[i];
      // Pieces of the same size score identically and only a strictly better
      // score wins, so only the first one of each size can ever be picked.
      // A job of 300 identical brackets used to score all 300 per placement.
      const dk = pc.w + 'x' + pc.h;
      if (tried.has(dk)) continue;
      tried.add(dk);
      const orientations = [{pw:pc.w, ph:pc.h, rot:false}];
      if (allowRotation && pc.w !== pc.h) orientations.push({pw:pc.h, ph:pc.w, rot:true});

      for (const {pw, ph, rot} of orientations) {
        for (const r of free) {
          // KERF-SAFE FIT: a piece needs room for itself PLUS a blade-kerf moat
          // on any side that faces into the sheet interior. If the free rect
          // already reaches the sheet edge on a side, no kerf is needed there
          // (you cut along the sheet boundary, not between two parts).
          if (fitsWithKerf(r, pw, ph, sheetW, sheetH)) {
            // Best Area Fit: prefer rect that wastes least space
            const leftoverHoriz = r.w - pw;
            const leftoverVert = r.h - ph;

           // Prefer tighter AND more square remaining spaces
           const score =
             (leftoverHoriz * leftoverVert) +
             (Math.min(leftoverHoriz, leftoverVert) * 0.25);
            if (score < bestScore) {
              bestScore = score;
              bestI = i;
              bestFit = {x:r.x, y:r.y, pw, ph, rot};
            }
          }
        }
      }
    }

    if (bestI === -1) break;

    const pc = rem[bestI];
    const {x, y, pw, ph, rot} = bestFit;
    placed.push({x, y, w:pw, h:ph, label:pc.label,
                 pieceIndex:pc.pieceIndex, instanceIndex:pc.instanceIndex, rotated:rot});
    rem.splice(bestI, 1);
    improved = true;

    // Split all free rects that overlap the placed piece (plus kerf).
    // Reserve a FULL kerf moat on the right and bottom of every piece, always.
    // The moat may extend past the sheet edge — splitFreeRect simply yields no
    // rect there — but it guarantees no later piece is seated within a blade's
    // width of this one. (Previously the kerf was dropped near the sheet edge,
    // which let a piece in an adjacent free rect sit a sub-kerf distance away.)
    const kw = pw + KERF;
    const kh = ph + KERF;
    const kx = x, ky = y;
    const placedBox = { x: kx, y: ky, w: kw, h: kh };
    const newFree = [];
    for (const r of free) {
      if (rectIntersects(r, placedBox)) {
        newFree.push(...splitFreeRect(r, kx, ky, kw, kh));
      } else {
        newFree.push(r);
      }
    }
    free = pruneFreeRects(newFree);
  }

  const area = placed.reduce((s, p) => s + p.w * p.h, 0);
  const sheetArea = sheetW * sheetH;

  // ── SECOND-CHANCE PLACEMENT ──
  // The Best-Area-Fit pass can leave usable gaps unfilled (e.g. thin strips
  // that a stack of bigger pieces left room for). Before giving up on a piece,
  // try to slot each remaining piece into ANY genuinely empty rectangle on the
  // sheet, found by scanning the actual placed-piece gaps. This recovers space
  // the free-rect tracking lost.
  if (rem.length) {
    let stillRem = [];
    for (const pc of rem) {
      const spot = findEmptySpot(sheetW, sheetH, placed, pc, allowRotation);
      if (spot) {
        placed.push({ x:spot.x, y:spot.y, w:spot.w, h:spot.h, label:pc.label,
                      pieceIndex:pc.pieceIndex, instanceIndex:pc.instanceIndex, rotated:spot.rot });
      } else {
        stillRem.push(pc);
      }
    }
    rem = stillRem;
  }

  const finalArea = placed.reduce((s, p) => s + p.w * p.h, 0);
  return {
    placed, unplaced: rem,
    wastePercent: Math.round((1 - finalArea / sheetArea) * 100),
    sheetW, sheetH, sheetArea
  };
}

// ── GUILLOTINE CUT SEQUENCE ───────────────────────────────────
// A guillotine layout is only useful to a saw operator if it comes with the
// ORDER of cuts: every cut on a panel saw runs edge to edge, so the sheet has
// to be split in two, then each half split again, recursively. The app has
// never output that, which made guillotine mode decorative.
//
// This recovers the cut tree from the finished layout: find a line that runs
// clean across the current region without crossing any part, split, recurse.
// If no such line exists the layout is not guillotine-cuttable (which is normal
// and expected for free placement) and we return null rather than inventing a
// sequence that cannot be sawn.
function deriveGuillotineCuts(placed, sheetW, sheetH, kerf) {
  const K = Math.max(0, +kerf || 0);
  const EPS = 1e-6;
  const cuts = [];
  let n = 0;
  let ok = true;

  function rec(x0, y0, x1, y1, items, depth) {
    if (!ok || items.length <= 1) return;

    // A cut line is valid if every part lies wholly on one side of it, with at
    // least one part on each side. Candidates are the far edges of the parts.
    const tryAxis = function (axis) {
      const lines = [];
      items.forEach(function (p) { lines.push(axis === 'V' ? p.x + p.w : p.y + p.h); });
      lines.sort(function (a, b) { return a - b; });
      for (let i = 0; i < lines.length; i++) {
        const c = lines[i];
        if (axis === 'V' ? (c <= x0 + EPS || c >= x1 - EPS) : (c <= y0 + EPS || c >= y1 - EPS)) continue;
        const before = [], after = [];
        let straddles = false;
        for (const p of items) {
          const lo = axis === 'V' ? p.x : p.y;
          const hi = axis === 'V' ? p.x + p.w : p.y + p.h;
          if (hi <= c + EPS) before.push(p);
          else if (lo >= c + K - EPS) after.push(p);
          else { straddles = true; break; }
        }
        if (straddles || !before.length || !after.length) continue;
        return { c: c, before: before, after: after };
      }
      return null;
    };

    // Prefer the cut that runs the longer way across the region first — that is
    // how an operator breaks a sheet down in practice.
    const first = (x1 - x0) >= (y1 - y0) ? 'V' : 'H';
    const second = first === 'V' ? 'H' : 'V';
    let axis = first, hit = tryAxis(first);
    if (!hit) { axis = second; hit = tryAxis(second); }
    if (!hit) { ok = false; return; }

    if (axis === 'V') {
      cuts.push({ no: ++n, axis: 'V', pos: hit.c, from: y0, to: y1, depth: depth,
                  label: 'Cut down at X = ' + Math.round(hit.c) + 'mm' });
      rec(x0, y0, hit.c, y1, hit.before, depth + 1);
      rec(hit.c + K, y0, x1, y1, hit.after, depth + 1);
    } else {
      cuts.push({ no: ++n, axis: 'H', pos: hit.c, from: x0, to: x1, depth: depth,
                  label: 'Cut across at Y = ' + Math.round(hit.c) + 'mm' });
      rec(x0, y0, x1, hit.c, hit.before, depth + 1);
      rec(x0, hit.c + K, x1, y1, hit.after, depth + 1);
    }
  }

  rec(0, 0, sheetW, sheetH, placed.slice(), 0);
  return ok ? cuts : null;
}

// ── HOW GOOD IS THIS NEST, REALLY? ────────────────────────────
// 2D bin packing is NP-hard: no tool can prove a given nest is the best
// possible in reasonable time. What IS computable is a LOWER BOUND — a number
// of sheets that no arrangement, however clever, can beat. When the packer hits
// that bound the job is provably optimal and we say so; when it doesn't we show
// the gap honestly rather than implying perfection.
//
// Bound 1 (area). Every piece occupies a (w+kerf) x (h+kerf) box anchored at
// its top-left; those boxes are disjoint (that IS the kerf invariant) and all
// sit inside a (W+kerf) x (H+kerf) region, so the inflated areas must fit.
//
// Bound 2 (Fekete-Schepers dual feasible function). u_k maps a length to a
// larger "effective" length in a way that preserves feasibility, so the area
// bound recomputed on transformed sizes is still valid — and is far stronger,
// because it captures "two of these can never sit side by side", which raw
// area cannot see.
function _dffU(x, L, k) {
  if (x > L - k) return L;
  if (x >= k) return x;
  return 0;
}

function packingLowerBound(queue, W, H, kerf, allowRot) {
  if (!queue || !queue.length || !(W > 0) || !(H > 0)) return 0;
  const k = Math.max(0, +kerf || 0);
  const BW = W + k, BH = H + k, CAP = BW * BH;

  let sum = 0;
  for (const p of queue) sum += (p.w + k) * (p.h + k);
  let best = Math.ceil(sum / CAP - 1e-9);

  // Candidate k values: the piece sizes, and their complements (BW - size),
  // which is where the "two of these won't fit side by side" cases live.
  const cand = new Set();
  for (const p of queue) {
    [p.w + k, p.h + k].forEach(function(v){
      cand.add(v); cand.add(BW - v + 0.001); cand.add(BH - v + 0.001);
    });
  }
  let list = [];
  cand.forEach(function(v){ if (v > 0) list.push(v); });
  list.sort(function(a,b){ return a-b; });
  if (list.length > 14) {
    // Thin evenly rather than truncating, so both ends stay represented.
    const step = list.length / 14, thinned = [];
    for (let i = 0; i < 14; i++) thinned.push(list[Math.floor(i * step)]);
    list = thinned;
  }

  for (const kw of list) {
    if (kw > BW / 2) continue;
    for (const kh of list) {
      if (kh > BH / 2) continue;
      let t = 0;
      for (const p of queue) {
        const a1 = _dffU(p.w + k, BW, kw) * _dffU(p.h + k, BH, kh);
        // With rotation the piece picks its own orientation, so the bound MUST
        // take the cheaper one or it would not be a valid lower bound.
        const a2 = allowRot ? _dffU(p.h + k, BW, kw) * _dffU(p.w + k, BH, kh) : a1;
        t += Math.min(a1, a2);
      }
      const v = Math.ceil(t / CAP - 1e-9);
      if (v > best) best = v;
    }
  }
  return Math.max(best, 1);
}

// ── ITERATED LOCAL SEARCH OVER PIECE ORDER ────────────────────
// Measurement showed the remaining waste is not in WHERE a piece is seated —
// that packer is saturated — but in WHAT ORDER pieces are offered. So search
// the order. The engine below perturbs the sequence, re-packs, and keeps any
// arrangement that is better. It can only ever replace a result it beats, so
// it cannot make a nest worse.
//
// Two deliberate design choices:
//  * ITERATION cap, never a wall-clock budget. A time budget would give a
//    workshop PC more search than a phone, so the same cut list would nest
//    differently on different devices. A quoting tool must be reproducible.
//  * DETERMINISTIC seed derived from the job itself, so re-running the same
//    cut list always produces byte-identical output.
function _mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function _jobSeed(queue, W, H, kerf) {
  let hsh = 2166136261 >>> 0;
  const mix = function(v){ hsh ^= (v >>> 0); hsh = Math.imul(hsh, 16777619) >>> 0; };
  mix(W); mix(H); mix(Math.round((kerf || 0) * 100)); mix(queue.length);
  for (const p of queue) { mix(Math.round(p.w * 100)); mix(Math.round(p.h * 100)); }
  return hsh >>> 0;
}

// Sum of squared sheet fills. Rewards making SOME sheets full rather than all
// of them evenly half-full — which is what actually frees a sheet up — and
// gives the search a gradient while the sheet count is stuck on a plateau.
function _nestScore(bins, sheetW, sheetH) {
  const cap = sheetW * sheetH;
  let s = 0;
  for (const b of bins) { const f = b.usedArea / cap; s += f * f; }
  return s;
}

function _seqFromBins(bins) {
  const seq = [];
  for (const b of bins) for (const p of b.placed) seq.push(p);
  return seq;
}

function improveNest(W, H, queue, allowRot, maxIters, seed, startBins) {
  if (!startBins || !startBins.length) return startBins;
  const rng = _mulberry32(seed >>> 0);
  const rules = ['legacy','bssf','baf'];
  let best = startBins;
  let bestScore = _nestScore(best, W, H);
  let seq = _seqFromBins(best);
  const t0 = Date.now();
  let iters = 0;

  // EARLY EXIT ON PROOF. If the nest already matches the mathematical floor,
  // no arrangement can beat it, so searching further is provably wasted work.
  // This is the single biggest speed-up: most jobs are already optimal and now
  // skip the search entirely.
  let floor = 0;
  try { floor = packingLowerBound(queue, W, H, KERF, allowRot); } catch (e) { floor = 0; }
  if (floor > 0 && best.length <= floor) return best;

  // Stagnation cutoff. The search converges fast (measurement: 500 iterations
  // gets the same answer as 8000 on typical jobs), so once it stops finding
  // anything the remaining iterations are pure cost.
  const stagnationLimit = Math.max(200, Math.round(maxIters * 0.35));
  let sinceImproved = 0;

  // The iteration cap is what normally stops the loop. The elapsed check is a
  // safety valve for pathologically slow devices only, sampled every 64 passes
  // so Date.now() is not on the hot path.
  while (iters < maxIters) {
    if ((iters & 63) === 0 && Date.now() - t0 > 2500) break;
    if (sinceImproved >= stagnationLimit) break;
    iters++; sinceImproved++;
    const cand = seq.slice();
    const move = rng();

    if (move < 0.45 && best.length > 1) {
      // RUIN & RECREATE — the move that actually eliminates sheets. Empty the
      // least-full sheet and offer its pieces FIRST, so they get first pick of
      // every other sheet's leftover space.
      let worstI = 0, worstFill = Infinity;
      for (let i = 0; i < best.length; i++) {
        const f = best[i].usedArea / (W * H);
        if (f < worstFill) { worstFill = f; worstI = i; }
      }
      const victims = {};
      best[worstI].placed.forEach(function(p){ victims[pieceKey(p)] = 1; });
      const front = [], back = [];
      for (const p of cand) (victims[pieceKey(p)] ? front : back).push(p);
      for (let i = front.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = front[i]; front[i] = front[j]; front[j] = tmp;
      }
      cand.length = 0;
      for (const p of front) cand.push(p);
      for (const p of back) cand.push(p);
    } else if (move < 0.75) {
      // SEGMENT REVERSAL
      const i = Math.floor(rng() * cand.length);
      const j = Math.min(cand.length - 1, i + 1 + Math.floor(rng() * 12));
      for (let a = i, b = j; a < b; a++, b--) { const t = cand[a]; cand[a] = cand[b]; cand[b] = t; }
    } else {
      // SHIFT one piece to a random position
      const i = Math.floor(rng() * cand.length);
      const p = cand.splice(i, 1)[0];
      cand.splice(Math.floor(rng() * (cand.length + 1)), 0, p);
    }

    const bins = packOpenSheets(W, H, cand, allowRot, rules[Math.floor(rng() * rules.length)]);
    let total = 0;
    for (const b of bins) total += b.placed.length;
    if (total !== queue.length) continue;      // dropped a piece: reject outright

    const sc = _nestScore(bins, W, H);
    if (bins.length < best.length || (bins.length === best.length && sc > bestScore + 1e-12)) {
      best = bins; bestScore = sc; seq = _seqFromBins(bins);
      sinceImproved = 0;
      // Reached the floor mid-search: provably optimal, nothing left to find.
      if (floor > 0 && best.length <= floor) break;
    }
  }
  return best;
}

// Iterations scale INVERSELY with part count, because each iteration re-packs
// the whole job. This keeps total search work roughly constant instead of
// letting a 200-part job take ten times as long as a 20-part one.
function _ilsIterations(parts) {
  if (parts > 320) return 0;                      // too big to search cheaply
  return Math.max(250, Math.min(2200, Math.round(60000 / Math.max(1, parts))));
}

function packOpenSheets(sheetW, sheetH, queue, allowRot, rule) {
  const ar = allowRot !== false;
  const bins = [];

  for (const pc of queue) {
    const orientations = [{pw:pc.w, ph:pc.h, rot:false}];
    if (ar && pc.w !== pc.h) orientations.push({pw:pc.h, ph:pc.w, rot:true});

    let best = null;
    for (let bi = 0; bi < bins.length; bi++) {
      const b = bins[bi];
      for (const o of orientations) {
        for (const r of b.free) {
          if (!fitsWithKerf(r, o.pw, o.ph, sheetW, sheetH)) continue;
          const lh = r.w - o.pw, lv = r.h - o.ph;
          let score;
          if (rule === 'bssf')     score = Math.min(lh, lv);
          else if (rule === 'baf') score = r.w*r.h - o.pw*o.ph;
          else                     score = (lh*lv) + (Math.min(lh,lv)*0.25);
          // Tie-break toward the EARLIEST sheet so sheets actually finish
          // instead of every sheet filling half way. That bias is what makes
          // best-fit-decreasing beat next-fit.
          const key = score * 1000 + bi;
          if (!best || key < best.key) best = { key:key, bi:bi, r:r, pw:o.pw, ph:o.ph, rot:o.rot };
        }
      }
    }

    if (!best) {
      // Nothing fits anywhere: open a fresh sheet.
      let fit = null;
      for (const o of orientations) if (o.pw <= sheetW && o.ph <= sheetH) { fit = o; break; }
      if (!fit) continue;   // genuinely oversized; caller detects the shortfall
      bins.push({ free:[{x:0,y:0,w:sheetW,h:sheetH}], placed:[] });
      best = { bi: bins.length-1, r: bins[bins.length-1].free[0], pw:fit.pw, ph:fit.ph, rot:fit.rot };
    }

    const b = bins[best.bi];
    const x = best.r.x, y = best.r.y;
    b.placed.push({x:x, y:y, w:best.pw, h:best.ph, label:pc.label,
                   pieceIndex:pc.pieceIndex, instanceIndex:pc.instanceIndex, rotated:best.rot});
    const box = { x:x, y:y, w:best.pw + KERF, h:best.ph + KERF };
    const nf = [];
    for (const r of b.free) {
      if (rectIntersects(r, box)) nf.push(...splitFreeRect(r, x, y, best.pw + KERF, best.ph + KERF));
      else nf.push(r);
    }
    b.free = pruneFreeRects(nf);
  }

  return bins.map(function(b){
    const area = b.placed.reduce(function(s,p){return s+p.w*p.h;},0);
    return { placed:b.placed, unplaced:[], sheetW:sheetW, sheetH:sheetH, usedArea:area,
             wastePercent: ((sheetW*sheetH - area)/(sheetW*sheetH))*100 };
  });
}

// Try several piece orders and placement rules; keep the fewest sheets.
// Returns null unless EVERY piece was placed — a partial result is useless here
// and must never be mistaken for a complete one.
function packOpenBest(sheetW, sheetH, queue, allowRot, effort) {
  const sorters = PACK_SORTERS;
  const rules = ['legacy','bssf','baf'];
  const nS = Math.max(1, Math.min(sorters.length, effort|0));
  const nR = effort >= 5 ? 3 : effort >= 3 ? 2 : 1;
  let best = null;
  for (let si = 0; si < nS; si++) {
    const q = sorters[si](queue);
    for (let ri = 0; ri < nR; ri++) {
      const bins = packOpenSheets(sheetW, sheetH, q, allowRot, rules[ri]);
      let total = 0;
      for (const b of bins) total += b.placed.length;
      if (total !== queue.length) continue;      // dropped something: reject outright
      if (!best || bins.length < best.length) best = bins;
    }
  }
  return best;
}

// ── STOCK SHEET SIZES ─────────────────────────────────────────
// A material lists its sheet sizes as `sizes: [{w, h, price, max}]`. `max` is
// how many sheets of that size can be used (what you have, or what the
// supplier can send); null means no limit. Libraries saved before multiple
// sizes existed used size1/size2, which are read the same way.
const MAX_SHEET_SIZES = 12;
function stockSizes(libMat) {
  const raw = Array.isArray(libMat && libMat.sizes) ? libMat.sizes
            : [libMat && libMat.size1, libMat && libMat.size2];
  const out = [], seen = {};
  for (const s of raw) {
    if (!s || !(+s.w > 0) || !(+s.h > 0)) continue;
    const w = +s.w, h = +s.h, key = w + 'x' + h;
    if (seen[key]) continue;                      // one entry per size
    seen[key] = 1;
    const max = (s.max != null && s.max !== '' && +s.max >= 1) ? Math.floor(+s.max) : null;
    out.push({ w: w, h: h, price: +s.price || 0, max: max });
    if (out.length >= MAX_SHEET_SIZES) break;
  }
  return out;
}

// Sheets used per size (bought sheets only; a remnant is already owned).
function sheetsUsedBySize(sheetArr) {
  const used = {};
  for (const sh of sheetArr || []) {
    if (sh.isRemnant) continue;
    const k = sh.sheetW + 'x' + sh.sheetH;
    used[k] = (used[k] || 0) + 1;
  }
  return used;
}

// True if a layout uses no more sheets of any size than that size allows.
function withinStock(sheetArr, sizes) {
  const used = sheetsUsedBySize(sheetArr);
  return sizes.every(function(s){ return s.max == null || (used[s.w + 'x' + s.h] || 0) <= s.max; });
}

// The deeper searches (rebalancing, the open-sheets second opinion) try
// sizes in combination, so their cost climbs steeply with the number of
// sizes. With three sizes or fewer they try every size, exactly as before;
// with more, they try the `limit` (default 3) most promising. `rank` scores a
// size (lower is better) and `prefer` lists sizes to keep first (ones in use).
// Measured on 4-12 size materials: rebalancing over 3 sizes saves about 0.5%
// of material cost versus 2; the open-sheets search gains nothing from a
// third size, so it uses 2.
function searchSizes(sizes, rank, prefer, limit) {
  if (sizes.length <= 3) return sizes.slice();
  const lim = limit || 3;
  const keep = [];
  (prefer || []).forEach(function(s){ if (keep.indexOf(s) === -1 && keep.length < lim) keep.push(s); });
  sizes.slice().sort(function(a, b){ return rank(a) - rank(b) || (b.w * b.h - a.w * a.h); })
    .forEach(function(s){ if (keep.indexOf(s) === -1 && keep.length < lim) keep.push(s); });
  return sizes.filter(function(s){ return keep.indexOf(s) !== -1; });   // original order
}

// True when pieces were left over because a size with a sheet limit ran out,
// so the user is told "not enough stock" rather than something misleading.
function stockShortfall(unplaced, sizes, sheetArr) {
  if (!unplaced || !unplaced.length) return false;
  const used = sheetsUsedBySize(sheetArr);
  return sizes.some(function(s){ return s.max != null && (used[s.w + 'x' + s.h] || 0) >= s.max; });
}

// What a set of sheets costs, so greedy and open-sheet candidates can be
// compared on money rather than sheet count when sizes differ in price.
function sheetSetCost(sheetArr, sizes) {
  let cost = 0;
  for (const sh of sheetArr) {
    if (sh.isRemnant) continue;
    const sz = sizes.find(function(z){ return z.w === sh.sheetW && z.h === sh.sheetH; });
    cost += (sz && sz.price > 0) ? sz.price : 0;
  }
  return cost;
}

// Packing is deterministic, and the consolidation and rebalancing passes ask
// for the same pieces on the same sheet many times over. runMat() switches
// this cache on for the length of one job. Same answers, just not recomputed.
let _packCache = null;
const PACK_CACHE_MAX = 20000;

function packSheetBest(sheetW, sheetH, queue, allowRot, cuttingMethod) {
  if (!_packCache) return _packSheetBest(sheetW, sheetH, queue, allowRot, cuttingMethod);
  let key = sheetW + 'x' + sheetH + '|' + (allowRot !== false ? 1 : 0) + (cuttingMethod || 'free') + '|' + PACK_EFFORT + '|';
  for (const p of queue) key += p.pieceIndex + '-' + p.instanceIndex + ':' + p.w + ':' + p.h + ',';
  let r = _packCache.get(key);
  if (!r) {
    r = _packSheetBest(sheetW, sheetH, queue, allowRot, cuttingMethod);
    if (_packCache.size < PACK_CACHE_MAX) _packCache.set(key, r);
  }
  // Callers annotate and mutate what they get back, so hand out a copy.
  return Object.assign({}, r, {
    placed: r.placed.map(function(p){ return Object.assign({}, p); }),
    unplaced: r.unplaced.slice()
  });
}

function _packSheetBest(sheetW, sheetH, queue, allowRot, cuttingMethod) {
  const cm = cuttingMethod || 'free';
  const ar = allowRot !== false;
  if (cm === 'guillotine') return guillotinePackBest(sheetW, sheetH, queue, ar);

  const sorters = PACK_SORTERS;   // see PACK_SORTERS for what each ordering does
  const cap = Math.max(1, Math.min(sorters.length, PACK_EFFORT|0));
  let best = null;
  for (let si = 0; si < cap; si++) {
    const result = maxRectsPack(sheetW, sheetH, sorters[si](queue), ar);
    if (!best ||
        result.placed.length > best.placed.length ||
        (result.placed.length === best.placed.length &&
         result.wastePercent < best.wastePercent)) {
      best = result;
    }
  }
  return best;
}

// Estimate minimum sheets still needed for remaining pieces (lower bound)
function estimateRemaining(queue, sizes, allowRot, cm) {
  if (!queue.length) return 0;
  let remaining = [...queue];
  let sheetsNeeded = 0;
  while (remaining.length > 0 && sheetsNeeded < 10) {
    let bestFit = null;
    for (const sz of sizes) {
      const r = packSheetBest(sz.w, sz.h, remaining, allowRot, cm);

      if (
        !bestFit ||
        r.placed.length > bestFit.placed.length
      ) {
        bestFit = r;
      }
    }

    if (!bestFit || !bestFit.placed.length) {
      break;
    }

    const done = new Set(
      bestFit.placed.map(
        p => `${p.pieceIndex}-${p.instanceIndex}`
      )
    );

    remaining = remaining.filter(
      p => !done.has(`${p.pieceIndex}-${p.instanceIndex}`)
    );

    sheetsNeeded++;
  }

  return sheetsNeeded;
}

// ── CROSS-SIZE REBALANCING ───────────────────────────────────
// The greedy packer commits one sheet at a time, so it can end a job with
// several under-filled sheets of the SMALL size when those pieces would have
// been cheaper (or fewer sheets) combined onto the LARGE size — or vice versa.
// This pass pools the pieces from the least-utilised sheets, re-packs that pool
// fresh across every sheet size, and keeps whichever layout costs less.
// SAFETY: only swaps in the new layout if the exact same pieces are preserved
// AND it is genuinely cheaper (or same cost with fewer sheets).
function rebalanceSheets(sheets, sizes, allowRot, cm) {
  if (sheets.length < 2 || sizes.length < 2) return sheets;

  function sheetCost(sh){
    const sz = sizes.find(function(s){ return s.w===sh.sheetW && s.h===sh.sheetH; });
    return sz ? (sz.price||0) : 0;
  }
  function totalCost(arr){ return arr.reduce(function(a,s){ return a + sheetCost(s); }, 0); }
  function sig(arr){
    // Key on piece IDENTITY (pieceIndex-instanceIndex), not dimensions. Every
    // instance is unique, so an identity multiset catches loss, duplication AND
    // any swap between two equal-dimension pieces — which a dimension-only
    // signature could not detect. Guards the invariant we actually care about.
    const c={};
    arr.forEach(function(s){ s.placed.forEach(function(p){
      const k = pieceKey(p); c[k]=(c[k]||0)+1;
    });});
    return c;
  }
  function sameSig(a,b){ const ka=Object.keys(a),kb=Object.keys(b); if(ka.length!==kb.length)return false; return ka.every(function(k){return a[k]===b[k];}); }

  const haveCost = sizes.every(function(s){ return s.price && s.price>0; });
  const originalSig = sig(sheets);

  // Sizes to re-pack onto: all of them when there are three or fewer (the
  // original behaviour); otherwise the sizes in use plus the best value.
  const usedNow = sheetsUsedBySize(sheets);
  const inUse = sizes.filter(function(s){ return usedNow[s.w + 'x' + s.h]; })
                     .sort(function(a, b){ return usedNow[b.w + 'x' + b.h] - usedNow[a.w + 'x' + a.h]; });
  const poolSizes = searchSizes(sizes, function(s){ return haveCost ? s.price / (s.w * s.h) : -(s.w * s.h); }, inUse);

  // Sort by utilisation, least-full first
  function util(sh){ return sh.placed.reduce(function(a,p){return a+p.w*p.h;},0)/(sh.sheetW*sh.sheetH); }

  let working = sheets.slice();
  let improved = true;
  let safety = 8;

  while (improved && safety-- > 0) {
    improved = false;
    const sorted = working.map(function(s,i){ return {i:i, u:util(s)}; }).sort(function(a,b){ return a.u-b.u; });

    // Try pooling the N least-full sheets (N from 2 up to 5) and re-packing them.
    for (let n = 2; n <= Math.min(5, working.length); n++) {
      const poolIdx = sorted.slice(0, n).map(function(o){ return o.i; });
      const poolSheets = poolIdx.map(function(i){ return working[i]; });
      if (poolSheets.some(function(s){ return s.isRemnant; })) continue;

      // Pool all their pieces
      const pool = [];
      poolSheets.forEach(function(s){ s.placed.forEach(function(p){
        pool.push({ w:p.w, h:p.h, label:p.label, pieceIndex:p.pieceIndex, instanceIndex:p.instanceIndex });
      });});

      // Re-pack the pool across the sizes, cost-aware, never using more of a
      // size than is left once the sheets outside the pool are counted.
      const rest = working.filter(function(s,i){ return poolIdx.indexOf(i) === -1; });
      const usedRest = sheetsUsedBySize(rest);
      const caps = poolSizes.map(function(s){ return s.max == null ? null : s.max - (usedRest[s.w + 'x' + s.h] || 0); });
      const newLayout = packPoolBestValue(pool, poolSizes, allowRot, cm, haveCost, caps);
      if (!newLayout) continue;

      // Did everything get placed?
      const placedCount = newLayout.reduce(function(a,s){ return a + s.placed.length; }, 0);
      if (placedCount !== pool.length) continue;

      // Compare: old pool vs new layout
      const oldCost = haveCost ? poolSheets.reduce(function(a,s){ return a+sheetCost(s); },0) : poolSheets.length;
      const newCost = haveCost ? newLayout.reduce(function(a,s){
        const sz = sizes.find(function(z){return z.w===s.sheetW&&z.h===s.sheetH;}); return a+(sz?sz.price:0);
      },0) : newLayout.length;

      const fewerSheets = newLayout.length < poolSheets.length;
      const cheaper = newCost < oldCost - 0.01;
      const sameCostFewerSheets = Math.abs(newCost-oldCost) < 0.01 && fewerSheets;

      if (cheaper || sameCostFewerSheets) {
        // Build candidate: all non-pool sheets + new layout
        const candidate = rest.concat(newLayout);
        // Integrity check
        if (sameSig(sig(candidate), originalSig) && withinStock(candidate, sizes)) {
          working = candidate;
          improved = true;
          break;
        }
      }
    }
  }

  // Final guard
  if (!sameSig(sig(working), originalSig)) return sheets;
  return working;
}

// Pack a pool of pieces across sizes, choosing the layout with the lowest
// TOTAL cost (not greedy per-sheet). Tries leading with each sheet size and
// recursively packs the remainder, keeping the cheapest complete layout.
function packPoolBestValue(pool, sizes, allowRot, cm, haveCost, caps) {
  const depthLimit = 40; // guard against pathological recursion
  let bestResult = null;
  let bestCost = Infinity;

  function costOf(layout) {
    if (!haveCost) return layout.length; // no prices → minimise sheet count
    return layout.reduce(function(a, s){
      const sz = sizes.find(function(z){ return z.w===s.sheetW && z.h===s.sheetH; });
      return a + (sz ? sz.price : 0);
    }, 0);
  }

  function solve(queue, acc, depth) {
    if (queue.length === 0) {
      const c = costOf(acc);
      if (c < bestCost) { bestCost = c; bestResult = acc.slice(); }
      return;
    }
    if (depth > depthLimit) return;
    if (costOf(acc) >= bestCost) return; // prune

    for (let si = 0; si < sizes.length; si++) {
      const sz = sizes[si];
      if (caps && caps[si] != null) {
        let n = 0;
        for (const a of acc) if (a.sheetW === sz.w && a.sheetH === sz.h) n++;
        if (n >= caps[si]) continue;               // none of this size left
      }
      const r = packSheetBest(sz.w, sz.h, queue, allowRot, cm);
      if (!r.placed.length) continue;
      const done = new Set(r.placed.map(function(p){ return pieceKey(p); }));
      const rest = queue.filter(function(p){ return !done.has(pieceKey(p)); });
      solve(rest, acc.concat([r]), depth+1);
    }
  }

  solve(pool.slice(), [], 0);
  return bestResult;
}

// ── CONSOLIDATION PASS ───────────────────────────────────────
// The greedy packer can leave near-empty "orphan" sheets at the end of a job.
// This pass tries to empty the least-full sheet by re-fitting its pieces onto
// other sheets' spare space. SAFETY FIRST: a consolidation is only committed
// if a full integrity check confirms the exact same multiset of pieces exists
// afterwards. If anything would be lost, the change is rejected entirely.
function consolidateSheets(sheets, allowRot, cm) {
  if (sheets.length < 2) return sheets;

  // Signature of all pieces by IDENTITY (a multiset we must preserve exactly).
  function pieceSignature(sheetArr) {
    const counts = {};
    sheetArr.forEach(function(s){
      s.placed.forEach(function(p){
        // Key on piece identity (pieceIndex-instanceIndex). Every instance is
        // unique, so this catches loss, duplication AND a swap between two
        // equal-dimension pieces — stronger than a dimension-only signature.
        const k = pieceKey(p);
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    return counts;
  }
  function sameSignature(s1, s2) {
    const k1 = Object.keys(s1), k2 = Object.keys(s2);
    if (k1.length !== k2.length) return false;
    return k1.every(function(k){ return s1[k] === s2[k]; });
  }

  const originalSig = pieceSignature(sheets);
  let working = sheets.slice();
  let madeProgress = true;
  let safety = working.length + 5;

  while (madeProgress && safety-- > 0) {
    madeProgress = false;

    const order = working
      .map(function(s, i){
        const used = s.placed.reduce(function(a,p){return a + p.w*p.h;},0);
        return { i: i, fill: used / (s.sheetW * s.sheetH) };
      })
      .sort(function(a,b){ return a.fill - b.fill; });

    for (let oi = 0; oi < order.length; oi++) {
      const donorIdx = order[oi].i;
      const donor = working[donorIdx];
      if (!donor || donor.isRemnant) continue;

      // Donor pieces to rehome
      let remaining = donor.placed.map(function(p){
        return { w:p.w, h:p.h, label:p.label, pieceIndex:p.pieceIndex, instanceIndex:p.instanceIndex };
      });

      // Build a candidate new layout: copies of all non-donor sheets, into which
      // we try to absorb the donor's pieces.
      const candidate = working.map(function(s, idx){
        if (idx === donorIdx) return null;
        return s;
      });

      for (let t = 0; t < candidate.length && remaining.length; t++) {
        const target = candidate[t];
        if (!target || target.isRemnant) continue;

        const existing = target.placed.map(function(p){
          return { w:p.w, h:p.h, label:p.label, pieceIndex:p.pieceIndex, instanceIndex:p.instanceIndex };
        });
        const combined = existing.concat(remaining);
        const repacked = packSheetBest(target.sheetW, target.sheetH, combined, allowRot, cm);

        // Which of the COMBINED pieces actually got placed?
        const placedSet = new Set(repacked.placed.map(function(p){return pieceKey(p);}));
        // All existing target pieces must still be placed (we can't drop them)
        const keptAllExisting = existing.every(function(p){ return placedSet.has(pieceKey(p)); });
        if (!keptAllExisting) continue;

        // Did we place any NEW donor pieces here?
        const newlyPlaced = remaining.filter(function(p){ return placedSet.has(pieceKey(p)); });
        if (newlyPlaced.length === 0) continue;

        // Accept this target's new layout
        repacked.sheetW = target.sheetW;
        repacked.sheetH = target.sheetH;
        repacked.unplaced = [];
        candidate[t] = repacked;
        // Remove the donor pieces we just placed
        const placedDonorKeys = new Set(newlyPlaced.map(function(p){return pieceKey(p);}));
        remaining = remaining.filter(function(p){ return !placedDonorKeys.has(pieceKey(p)); });
      }

      // Only commit if EVERY donor piece was rehomed...
      if (remaining.length === 0) {
        const newWorking = candidate.filter(function(s){ return s !== null; });
        // ...AND the integrity check passes (no piece lost or duplicated)
        if (sameSignature(pieceSignature(newWorking), originalSig)) {
          working = newWorking;
          madeProgress = true;
          break;
        }
      }
    }
  }

  // Final guard: if anything went wrong, fall back to the original layout.
  if (!sameSignature(pieceSignature(working), originalSig)) {
    return sheets;
  }
  return working;
}

// Recompute every placed piece's `rotated` flag from first principles, by
// comparing its final placed orientation against the ORIGINAL dimensions the
// user entered (pieces[pieceIndex]). The packer's consolidation/rebalance
// passes re-pool pieces using their already-placed (possibly rotated) sizes,
// so a flag derived mid-pipeline can disagree with reality — e.g. an 813x703
// piece placed as 703x813 but labelled "not rotated". Running this once at the
// very end makes the flag authoritative regardless of how many repack passes
// ran. This only touches the boolean flag; piece positions and sizes are left
// exactly as packed, so it cannot affect placement, conservation, or kerf.
function normalizeRotatedFlags(sheets, pieces) {
  if (!sheets || !pieces) return;
  sheets.forEach(function(s){
    if (!s || !s.placed) return;
    s.placed.forEach(function(p){
      var orig = pieces[p.pieceIndex];
      if (!orig) return;                            // unknown piece: leave as-is
      var ow = +orig.w, oh = +orig.h;
      if (ow === oh) { p.rotated = false; return; } // square: never rotated
      p.rotated = (p.w === oh && p.h === ow);       // rotated iff dims are swapped
    });
  });
}

// Smallest stock sheet that would take a piece of w×h. With rotation allowed
// the orientation is free, so the answer is short-side × long-side. With grain
// locked the piece can only go one way up, so the sheet must be at least w×h
// exactly. Used to turn "this doesn't fit" into "order a sheet at least this big".
function minSheetFor(w, h, allowRot) {
  w = +w; h = +h;
  return allowRot ? { w: Math.min(w,h), h: Math.max(w,h) } : { w: w, h: h };
}

// Fallback packer: greedy only, no consolidation/rebalancing. Used if the
// full runMat throws, so one material's optimisation bug can't break the job.
// Takes the remnant too — without it, a crash in runMat silently made the user
// pay for an extra sheet they already had on the rack.
function runMatSafe(libMat, pieces, jobQty, remnant) {
  const mult = Math.max(1, parseInt(jobQty) || 1);
  let queue = [];
  pieces.forEach(function(p, pi){
    for (let q = 0; q < (+p.qty||1) * mult; q++)
      queue.push({...p, w:+p.w, h:+p.h, label:p.label||'', pieceIndex:pi, instanceIndex:q});
  });
  const sizes = stockSizes(libMat);
  if (!sizes.length) return { sheets:[], unplaced:queue, sizeMap:{}, noValidSize:true };

  const ar = libMat.allowRotation !== false;
  const cm = libMat.cuttingMethod || 'free';
  const remnantSheets = [];
  if (remnant && remnant.w >= 10 && remnant.h >= 10) {
    const rr = packSheetBest(remnant.w, remnant.h, queue, ar, cm);
    if (rr.placed.length > 0) {
      rr.isRemnant = true; rr.sheetW = remnant.w; rr.sheetH = remnant.h;
      remnantSheets.push(rr);
      const rdone = new Set(rr.placed.map(function(p){return pieceKey(p);}));
      queue = queue.filter(function(p){ return !rdone.has(pieceKey(p)); });
    }
  }
  const sheets = [];
  const usedSafe = sizes.map(function(){ return 0; });
  let limit = 200;
  while (queue.length && limit-- > 0) {
    let best = null, bestScore = Infinity, bestSi = -1;
    for (let si = 0; si < sizes.length; si++) {
      const sz = sizes[si];
      if (sz.max != null && usedSafe[si] >= sz.max) continue;
      const r = packSheetBest(sz.w, sz.h, queue, ar, cm);
      if (!r.placed.length) continue;
      const placedArea = r.placed.reduce(function(a,p){return a+p.w*p.h;},0);
      const score = (sz.price||1) / Math.max(placedArea, 1);
      if (best === null || score < bestScore) { best = r; bestScore = score; bestSi = si; }
    }
    if (!best || !best.placed.length) break;
    usedSafe[bestSi]++;
    sheets.push(best);
    const done = new Set(best.placed.map(function(p){return pieceKey(p);}));
    queue = queue.filter(function(p){ return !done.has(pieceKey(p)); });
  }
  const sizeMap = {};
  sheets.forEach(function(s){
    const k = s.sheetW+'\u00d7'+s.sheetH; sizeMap[k] = (sizeMap[k]||0)+1;
  });
  remnantSheets.concat(sheets).forEach(function(s){
    const offcut = largestEmptyRect(s.sheetW, s.sheetH, s.placed);
    const usable = isUsableOffcut(offcut);
    s.offcut = offcut; s.usableOffcut = usable ? offcut : null;
    const sa = s.sheetW*s.sheetH;
    const ua = s.placed.reduce(function(a,p){return a+p.w*p.h;},0);
    s.utilPercent = Math.round(ua/sa*100);
    s.usablePercent = usable ? Math.round(offcut.area/sa*100) : 0;
    s.scrapPercent = Math.max(0, 100 - s.utilPercent - s.usablePercent);
  });
  const safeAll = remnantSheets.concat(sheets);
  normalizeRotatedFlags(safeAll, pieces);
  return { sheets: safeAll, unplaced:queue, sizeMap, allowRotation: ar,
           stockShort: stockShortfall(queue, sizes, safeAll) };
}

function runMat(libMat, pieces, remnant, jobQty) {
  _packCache = new Map();
  try { return _runMat(libMat, pieces, remnant, jobQty); }
  finally { _packCache = null; }
}

function _runMat(libMat, pieces, remnant, jobQty) {
  // Expand pieces by quantity × job multiplier
  const mult = Math.max(1, parseInt(jobQty) || 1);
  let queue = [];
  pieces.forEach((p, pi) => {
    for (let q = 0; q < (+p.qty||1) * mult; q++)
      queue.push({...p, w:+p.w, h:+p.h, label:p.label||'', pieceIndex:pi, instanceIndex:q});
  });

  // ── EFFORT TUNING (performance) ──
  // Cost grows super-linearly with parts: each sheet placement tries multiple
  // sorter strategies × both stock sizes, and the per-pack cost itself rises as
  // pieces-per-sheet grows. We taper the work for big jobs so the app stays
  // responsive. None of this affects correctness — every level produces a
  // layout with no lost, duplicated, overlapping or sub-kerf parts.
  const totalParts = queue.length;
  if      (totalParts <= 60)  PACK_EFFORT = 8;   // small job: try everything
  else if (totalParts <= 120) PACK_EFFORT = 6;
  else if (totalParts <= 250) PACK_EFFORT = 4;
  else if (totalParts <= 450) PACK_EFFORT = 2;
  else                        PACK_EFFORT = 1;   // huge job: strongest single heuristic
  // The remaining-sheets lookahead (estimateRemaining) itself runs a full pack
  // per size; skip it on large jobs where its guidance is marginal.
  let useLookahead = totalParts <= 220;

  // Build the list of valid stock sheet sizes. A size only counts if it has
  // real positive width AND height — otherwise packing onto it is impossible.
  const sizes = stockSizes(libMat);
  // The lookahead packs every size again for every sheet, so its cost is
  // squared in the number of sizes. Beyond three, use the cheap area estimate.
  if (sizes.length > 3) useLookahead = false;

  // No usable stock size for this material → return a clear error, not silent failure.
  if (!sizes.length) {
    return { sheets:[], unplaced:queue, sizeMap:{}, noValidSize:true, matName:libMat.name };
  }

  // Use remnant sheet first if provided
  let remnantSheets = [];
  if (remnant && remnant.w >= 10 && remnant.h >= 10) {
    const _cm = libMat.cuttingMethod || 'free';
    const _ar = libMat.allowRotation !== false;
    const _rr = packSheetBest(remnant.w, remnant.h, queue, _ar, _cm);
    if (_rr.placed.length > 0) {
      _rr.isRemnant = true; _rr.sheetW = remnant.w; _rr.sheetH = remnant.h;
      remnantSheets.push(_rr);
      const _done = new Set(_rr.placed.map(function(p){return pieceKey(p);}));
      queue = queue.filter(function(p){return !_done.has(pieceKey(p));});
    }
  }

  const largestSheetArea = Math.max(...sizes.map(sz => sz.w * sz.h));
  // If every size has a real price, switch scoring to cost-based (minimise £ spent).
  const havePrices = sizes.every(sz => sz.price && sz.price > 0);
  const maxSheetPrice = havePrices ? Math.max(...sizes.map(sz => sz.price)) : 1;
  // Snapshot of everything still to place once the remnant has been used.
  // The second-opinion packer below re-packs exactly this set from scratch.
  const originalQueue = queue.slice();

  const sheets = [];
  const usedBySize = sizes.map(function(){ return 0; });
  let limit = 150;

  while (queue.length > 0 && limit-- > 0) {
    let bestChoice = null;
    let bestScore = Infinity;
    let bestSi = -1;
    const _ar = libMat.allowRotation !== false;
    const _cm = libMat.cuttingMethod || 'free';

    for (let si = 0; si < sizes.length; si++) {
      const sz = sizes[si];
      if (sz.max != null && usedBySize[si] >= sz.max) continue;   // none left
      const r = packSheetBest(sz.w, sz.h, queue, _ar, _cm);

  if (!r.placed.length) continue;

  // Estimate sheets still needed after this layout. This lookahead runs a full
  // pack per size, so on large jobs we skip it and use a cheap area-based proxy
  // (it only feeds the no-price scoring branch below).
      // Only the no-price branch below reads estRemaining. Computing it on a
      // priced job (which is every job using a starter pack or the master
      // library) ran a FULL pack per sheet size, up to 10 times, and threw the
      // answer away — measured at ~93ms per call on an 80-part queue and the
      // bulk of total calculate time. Compute it only when it is used.
      let estRemaining = 0;
      if (!havePrices) {
        if (useLookahead) {
          estRemaining = estimateRemaining(r.unplaced, sizes, _ar, _cm);
        } else {
          const remArea = r.unplaced.reduce((a,p)=>a+p.w*p.h,0);
          estRemaining = remArea / largestSheetArea; // approximate sheets-worth still to cut
        }
      }

  let score;
  if (havePrices) {
    // ── COST-EFFICIENCY SCORING ──
    // The real goal is lowest total £ for the whole job, which means getting
    // the best value out of every sheet we open — not just picking the
    // cheapest sheet each step (which biases toward small, underused sheets).
    //
    // We score by the cost of the material we'll actually CONSUME to finish:
    //   placedArea on this sheet + estimated area still to cut,
    // priced at this sheet's real £-per-area, plus a penalty for the empty
    // space we're "buying" on this sheet. A big sheet that packs lots of
    // pieces tightly beats two small sheets that each sit half-empty.
    const placedArea = r.placed.reduce((a, p) => a + p.w * p.h, 0);
    const sheetArea = sz.w * sz.h;
    const thisSheetPricePerArea = sz.price / sheetArea;
    const utilisation = placedArea / sheetArea; // 0..1, higher is better

    const cheapestPerArea = Math.min(...sizes.map(s => s.price / (s.w * s.h)));
    const remainingArea = r.unplaced.reduce((a, p) => a + p.w * p.h, 0);
    const estRemainingCost = remainingArea * cheapestPerArea * 1.12;

    // Cost actually committed by choosing this sheet = full sheet price
    // (you pay for the whole sheet, used or not). Lower total projected spend wins.
    const thisSheetCost = sz.price;
    const projectedTotal = thisSheetCost + estRemainingCost;

    // Penalise poor utilisation so a half-empty sheet is only chosen when it
    // genuinely has to be. The penalty is the £ value of the empty space.
    const wastedAreaCost = (sheetArea - placedArea) * thisSheetPricePerArea;

    score = (projectedTotal + wastedAreaCost * 0.5) / maxSheetPrice;
    // Tie-break nudge: prefer higher utilisation outright
    score -= utilisation * 0.001;
  } else {
    // ── AREA-BASED SCORING (no prices set) ──
    // Reward packing more pieces per sheet and lower waste; do NOT bias toward
    // smaller sheets (that was causing two half-used small sheets to be chosen
    // over one well-filled big sheet).
    const placedArea = r.placed.reduce((a, p) => a + p.w * p.h, 0);
    const utilisation = placedArea / (sz.w * sz.h);
    const wasteWeight = r.wastePercent / 100;
    score = (estRemaining * 1.0) + (wasteWeight * 0.6) - (utilisation * 0.5);
  }

  if (
    !bestChoice ||
    score < bestScore ||
    (
      score === bestScore &&
      r.placed.length > bestChoice.placed.length
    )
  ) {
    bestChoice = r;
    bestScore = score;
    bestSi = si;
  }
}

    if (!bestChoice || !bestChoice.placed.length) break;

    usedBySize[bestSi]++;
    sheets.push(bestChoice);
    const done = new Set(
      bestChoice.placed.map(p => `${p.pieceIndex}-${p.instanceIndex}`)
    );
    queue = queue.filter(p => !done.has(`${p.pieceIndex}-${p.instanceIndex}`));
  }

  // Total parts placed — used to gate the expensive optimisation passes below.
  const _placedCount = sheets.reduce(function(a,s){ return a + s.placed.length; }, 0);

  // ── CONSOLIDATION + CROSS-SIZE REBALANCING ──
  // These two passes squeeze out near-empty orphan sheets and try pooling the
  // least-full sheets across stock sizes. They noticeably improve packing on
  // normal jobs, but both re-run a branch search whose cost grows with the
  // number of sheets, so on very large jobs (hundreds of parts) they become
  // slow. Above a threshold we skip them: the greedy result is already correct
  // and well-packed — at worst it uses a few more sheets than the fully
  // optimised version — and the job stays fast and responsive. Correctness
  // (no lost/duplicated/overlapping parts) is identical either way.
  // Consolidation is the cheaper of the two passes and pays for itself well past
  // the old 200-part ceiling. Cross-size rebalancing runs a branch search whose
  // cost grows with SHEET count, not part count, so it is gated on sheets.
  const CONSOLIDATE_PART_LIMIT = 450;
  const REBALANCE_SHEET_LIMIT  = 30;
  let consolidated = sheets;
  if (_placedCount <= CONSOLIDATE_PART_LIMIT) {
    consolidated = consolidateSheets(sheets, libMat.allowRotation !== false, libMat.cuttingMethod || 'free');
    if (consolidated.length <= REBALANCE_SHEET_LIMIT) {
      consolidated = rebalanceSheets(consolidated, sizes, libMat.allowRotation !== false, libMat.cuttingMethod || 'free');
    }
  }

  // ── SECOND OPINION: open-sheets best-fit-decreasing ──
  // Run the alternative decomposition over the same queue for each stock size
  // and keep whichever answer is cheaper (or, unpriced, uses fewer sheets).
  // Because we only ever ADOPT a candidate that beats the greedy result, this
  // can never make a job worse than it was before — it can only find a better
  // nest that the fill-one-then-next order could not see.
  const _cm = libMat.cuttingMethod || 'free';
  const _arOpen = libMat.allowRotation !== false;
  let _altFewerSheets = null;
  if (_cm !== 'guillotine' && _placedCount <= CONSOLIDATE_PART_LIMIT && originalQueue.length) {
    const havePricesForCmp = sizes.every(function(z){ return z.price > 0; });
    // Placing more pieces always wins (it only differs when stock runs out);
    // then money, then sheet count (or the other way round when unpriced).
    const scoreOf = function(arr){
      const miss = originalQueue.length - arr.reduce(function(a, sh){ return a + sh.placed.length; }, 0);
      return havePricesForCmp
        ? { m: miss, a: sheetSetCost(arr, sizes), b: arr.length }
        : { m: miss, a: arr.length, b: sheetSetCost(arr, sizes) };
    };
    const better = function(x, y){
      if (x.m !== y.m) return x.m < y.m;
      return x.a < y.a - 1e-9 || (Math.abs(x.a - y.a) < 1e-9 && x.b < y.b);
    };
    // Every piece must fit a size for an all-one-size nest to exist there.
    const fitsAll = function(sz){
      return originalQueue.every(function(p){
        return (p.w <= sz.w && p.h <= sz.h) || (_arOpen && p.h <= sz.w && p.w <= sz.h);
      });
    };
    const openSizes = searchSizes(sizes, function(sz){
      if (!fitsAll(sz)) return Infinity;
      let lb = 0;
      try { lb = packingLowerBound(originalQueue, sz.w, sz.h, KERF, _arOpen); } catch (e) { lb = 0; }
      return havePricesForCmp ? lb * sz.price : lb;
    }, [], 2);
    let bestArr = consolidated, bestScore = scoreOf(consolidated);
    // Also track the option with the FEWEST SHEETS. When prices are set the
    // engine optimises for money, which can mean buying 3 small sheets instead
    // of 2 big ones. That is usually right — but an extra sheet is extra
    // handling and extra setup that CutNest cannot price, so the alternative is
    // recorded and shown to the user rather than silently discarded.
    let fewestArr = consolidated;
    for (const sz of openSizes) {
      let cand = null;
      try { cand = packOpenBest(sz.w, sz.h, originalQueue, _arOpen, PACK_EFFORT); }
      catch (e) { cand = null; }
      if (!cand || !cand.length) continue;

      // Search the piece order for a better arrangement of this same size.
      //
      // IMPORTANT: improveNest minimises sheet count BEFORE consolidation, but
      // the answer the user gets is the cost AFTER consolidation. Those two are
      // not monotone with each other — an arrangement with one more sheet
      // pre-consolidation can consolidate down to fewer. Measured case: a
      // 350-part job came out 28 sheets / £1820 with the search off and
      // 29 sheets / £1885 with it on, because the search "improved" the
      // intermediate into something that consolidated worse.
      //
      // So the searched result does not REPLACE the unsearched one — both are
      // consolidated and scored, and the better wins. The search can now only
      // ever help.
      const candidates = [cand];
      const _iters = _ilsIterations(originalQueue.length);
      if (_iters > 0) {
        try {
          const imp = improveNest(sz.w, sz.h, originalQueue, _arOpen, _iters,
                                  _jobSeed(originalQueue, sz.w, sz.h, KERF), cand);
          if (imp && imp.length) candidates.push(imp);
        } catch (e) { /* keep the unsearched candidate */ }
      }

      for (let ci = 0; ci < candidates.length; ci++) {
        let candC;
        try { candC = consolidateSheets(candidates[ci], _arOpen, _cm); }
        catch (e) { candC = candidates[ci]; }
        if (!withinStock(candC, sizes)) continue;   // needs more sheets than exist
        const sc = scoreOf(candC);
        if (better(sc, bestScore)) {
          bestArr = candC; bestScore = sc;
        }
        if (sc.m === 0 && candC.length < fewestArr.length) fewestArr = candC;
      }
    }
    if (havePricesForCmp && bestScore.m === 0 && scoreOf(fewestArr).m === 0 && fewestArr.length < bestArr.length) {
      const cheapCost = sheetSetCost(bestArr, sizes);
      const fewCost   = sheetSetCost(fewestArr, sizes);
      if (fewCost > cheapCost) {
        const fewMap = {};
        fewestArr.forEach(function(sh){
          const k = sh.sheetW + '\u00d7' + sh.sheetH;
          fewMap[k] = (fewMap[k] || 0) + 1;
        });
        _altFewerSheets = { sheets: fewestArr.length, cost: fewCost,
                            savedSheets: bestArr.length - fewestArr.length,
                            extraCost: fewCost - cheapCost, sizeMap: fewMap };
      }
    }
    consolidated = bestArr;
  }

  // Replace sheets with the optimised set.
  // IMPORTANT: consolidated may be the SAME array reference as `sheets` (the
  // consolidation/rebalance passes can return the original on fallback). Copy
  // to a new array FIRST, otherwise clearing `sheets` also clears `consolidated`.
  const finalSheets = consolidated.slice();
  sheets.length = 0;
  finalSheets.forEach(function(s){ sheets.push(s); });

  const sizeMap = {};
  sheets.forEach(s => {
    const k = `${s.sheetW}\u00d7${s.sheetH}`;
    sizeMap[k] = (sizeMap[k] || 0) + 1;
  });

  // Compute the largest usable offcut for every sheet (remnant sheets too).
  // This reframes "waste" into reclaimable stock vs true scrap.
  const allSheets = remnantSheets.concat(sheets);
  allSheets.forEach(function(sh){
    const offcut = largestEmptyRect(sh.sheetW, sh.sheetH, sh.placed);
    const usable = isUsableOffcut(offcut);
    sh.offcut = offcut;
    sh.usableOffcut = usable ? offcut : null;
    const sheetArea = sh.sheetW * sh.sheetH;
    const usedArea = sh.placed.reduce(function(a,p){return a + p.w*p.h;},0);
    sh.utilPercent = Math.round((usedArea / sheetArea) * 100);
    sh.usablePercent = usable ? Math.round((offcut.area / sheetArea) * 100) : 0;
    // True scrap = everything that isn't a part and isn't the reclaimable offcut
    sh.scrapPercent = Math.max(0, 100 - sh.utilPercent - sh.usablePercent);
  });

  var _allSheets = remnantSheets.concat(sheets);
  normalizeRotatedFlags(_allSheets, pieces);
  // Unplaced = whatever is not on a final sheet. Taken from the final layout,
  // not the greedy pass, because a later pass may have placed pieces the greedy
  // pass could not (listing them as both placed and unplaced).
  const onSheet = new Set();
  sheets.forEach(function(sh){ sh.placed.forEach(function(p){ onSheet.add(pieceKey(p)); }); });
  const unplacedFinal = originalQueue.filter(function(p){ return !onSheet.has(pieceKey(p)); });
  // Recorded so optimalityVerdict() can compute the correct bound later.
  return {sheets: _allSheets, unplaced: unplacedFinal, sizeMap, allowRotation: libMat.allowRotation !== false,
          altFewerSheets: _altFewerSheets, stockShort: stockShortfall(unplacedFinal, sizes, _allSheets)};
}

// Find an empty spot for a single piece by scanning gaps between placed pieces.
// Returns {x,y,w,h,rot} or null. Honours kerf so cuts stay clean.
function findEmptySpot(sheetW, sheetH, placed, pc, allowRotation) {
  const orientations = [{pw:pc.w, ph:pc.h, rot:false}];
  if (allowRotation && pc.w !== pc.h) orientations.push({pw:pc.h, ph:pc.w, rot:true});

  // Candidate corner positions: sheet origin + right/bottom edges of every placed piece
  const xsSet = new Set([0]);
  const ysSet = new Set([0]);
  placed.forEach(function(p){
    xsSet.add(p.x + p.w + KERF);
    ysSet.add(p.y + p.h + KERF);
    xsSet.add(p.x);
    ysSet.add(p.y);
  });
  const xs = Array.from(xsSet).filter(function(v){return v>=0 && v<sheetW;}).sort(function(a,b){return a-b;});
  const ys = Array.from(ysSet).filter(function(v){return v>=0 && v<sheetH;}).sort(function(a,b){return a-b;});

  // Reserve a full blade-kerf moat on ALL FOUR sides of every existing piece.
  // (Previously the moat was only added to the right/bottom, so a piece slotted
  // against an existing piece's TOP or LEFT edge could sit with a sub-kerf gap.)
  const moats = placed.map(function(p){
    return { x:p.x-KERF, y:p.y-KERF, w:p.w+2*KERF, h:p.h+2*KERF };
  });

  // Same search order and same answer as testing every (x, y) against every
  // moat, which cost minutes when a sheet overflowed with a few hundred small
  // parts: only moats in this row band are tested, and once a candidate hits a
  // moat, every X up to that moat's right edge must hit it too, so those are
  // skipped.
  for (const {pw, ph, rot} of orientations) {
    for (const y of ys) {
      if (y + ph > sheetH) continue;
      const band = moats.filter(function(m){ return !(y+ph <= m.y || m.y+m.h <= y); });
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        if (x + pw > sheetW) break;               // xs is sorted
        let hitEnd = null;
        for (let j = 0; j < band.length; j++) {
          const m = band[j];
          if (!(x+pw <= m.x || m.x+m.w <= x)) { hitEnd = m.x + m.w; break; }
        }
        if (hitEnd === null) return { x:x, y:y, w:pw, h:ph, rot:rot };
        while (i + 1 < xs.length && xs[i + 1] < hitEnd) i++;
      }
    }
  }
  return null;
}

// ── ENTRY POINT ───────────────────────────────────────────────
// The one function the page and the worker call. `safe` selects the plain
// greedy packer, used only if the full optimiser throws.
function packJob(libMat, pieces, remnant, jobQty, safe) {
  return safe ? runMatSafe(libMat, pieces, jobQty, remnant) : runMat(libMat, pieces, remnant, jobQty);
}
