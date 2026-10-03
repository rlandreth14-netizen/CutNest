// Subtitles (.srt) for the YouTube walkthroughs, from the times each narration
// line was spoken (saved by youtube.js in youtube-<id>.json).
// Run: node marketing/srt.js [id ...]   (rewrites the .srt without re-recording)
'use strict';
const fs = require('fs'), path = require('path');

// The voice reads numbers and the web address out in words; the subtitles
// show them the way they're written.
const WRITTEN = [
  [/cutnest dot co dot uk/gi, 'cutnest.co.uk'],
  [/two mil, three one six brushed stainless/g, '2mm 316 brushed stainless'],
  [/forty by forty box/g, '40×40 box'],
  [/six metre and seven and a half metre/g, '6m and 7.5m'],
  [/eight by four MDF/g, '8×4 MDF'],
  [/ten by four/g, '10×4'],
  [/Untick parts can turn/g, 'Untick “Parts can turn”'],
  [/Two sheets/g, '2 sheets'],
  [/two sheets/g, '2 sheets'],
  [/needs three/g, 'needs 3'],
  [/Order two/g, 'Order 2'],
];
const MAX = 42; // characters per subtitle line, two lines per cue

// Break a line into cues: sentences, and long sentences at a comma.
function chunks(text) {
  const out = [];
  for (const s of text.match(/[^.?!]+[.?!]+/g) || [text]) {
    const t = s.trim();
    if (t.length <= MAX * 2) { out.push(t); continue; }
    let cur = '';
    for (const part of t.split(/(?<=,) /)) {
      if (cur && (cur + ' ' + part).length > MAX * 2) { out.push(cur); cur = part; } else cur = cur ? cur + ' ' + part : part;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function written(t) { return WRITTEN.reduce((s, [a, b]) => s.replace(a, b), t); }

// Two balanced lines, split at the space nearest the middle.
function wrap(t) {
  if (t.length <= MAX) return t;
  let best = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2))) best = i;
  return best < 0 ? t : t.slice(0, best) + '\n' + t.slice(best + 1);
}

function stamp(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w) => String(n).padStart(w, '0');
  return p(Math.floor(ms / 3600000), 2) + ':' + p(Math.floor(ms / 60000) % 60, 2) + ':' + p(Math.floor(ms / 1000) % 60, 2) + ',' + p(ms % 1000, 3);
}

// lines: [{ text, t, dur }] in video seconds. Each line's time is shared out
// between its cues by length, which tracks the voice closely.
function toSrt(lines) {
  const cues = [];
  for (const l of lines) {
    const parts = chunks(l.text), total = parts.reduce((n, p) => n + p.length, 0);
    let at = l.t;
    for (const p of parts) {
      const d = l.dur * p.length / total;
      cues.push({ from: at, to: at + d, text: wrap(written(p)) });
      at += d;
    }
  }
  return cues.map((c, i) => (i + 1) + '\n' + stamp(c.from) + ' --> ' + stamp(c.to) + '\n' + c.text + '\n').join('\n');
}

function write(dir, name) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'youtube-' + name + '.json'), 'utf8'));
  if (!m.lines || !m.lines.length) return null;
  const file = path.join(dir, 'youtube-' + name + '.srt');
  fs.writeFileSync(file, toSrt(m.lines));
  return file;
}

module.exports = { toSrt, write };

if (require.main === module) {
  const { OUT } = require('./build.js');
  const names = process.argv.slice(2).length ? process.argv.slice(2)
    : fs.readdirSync(OUT).map(f => (f.match(/^youtube-(\w+)\.json$/) || [])[1]).filter(Boolean);
  names.forEach(n => { const f = write(OUT, n); console.log(f ? '  ' + path.basename(f) : '  youtube-' + n + ': no spoken lines saved'); });
}
