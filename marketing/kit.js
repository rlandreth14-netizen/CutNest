// Builds the LinkedIn kit from posts.js: out/linkedin-posts.md (plain copy)
// and out/kit.html (every asset beside its post text, with copy buttons).
// Run: node marketing/kit.js
'use strict';
const fs = require('fs'), path = require('path');
const posts = require('./posts.js');
const OUT = path.join(__dirname, 'out');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chars = s => [...s].length;

// ── Markdown ──
const md = ['# CutNest on LinkedIn: post copy', '',
  'Post from your personal profile. Paste the first comment straight after posting.', ''];
for (const p of posts) {
  md.push('## ' + p.when + ': ' + p.title, '', 'Asset: `' + p.asset + '`' + (p.docTitle ? '  \nDocument title: ' + p.docTitle : ''), '',
    '```text', p.text, '```', '', 'First comment:', '', '```text', p.comment, '```', '');
}
fs.writeFileSync(path.join(OUT, 'linkedin-posts.md'), md.join('\n'));

// ── Page ──
const media = p => {
  if (p.kind === 'video') return '<video controls muted playsinline preload="metadata" poster="' + esc(p.preview || p.asset.replace('.mp4', '-cover.png')) + '" src="' + esc(p.asset) + '"></video>';
  if (p.kind === 'document') return '<img src="' + esc(p.preview) + '" alt="Carousel cover: 5 reasons you\'re over-ordering sheet material" loading="lazy">';
  return '<img src="' + esc(p.asset) + '" alt="' + esc(p.title) + ' post image" loading="lazy">';
};
const kindLabel = { image: 'Image post', video: 'Video post, captioned', document: 'Document post, 8 slides' };
const body = t => {
  const [hook, ...rest] = t.split('\n\n');
  return '<span class="fold">' + esc(hook) + '</span>' + (rest.length ? '\n\n' + esc(rest.join('\n\n')) : '');
};

const weeks = [];
for (const p of posts) {
  const [w, day] = p.when.split(' · ');
  let row = weeks.find(r => r.w === w);
  if (!row) weeks.push(row = { w, Tue: null, Thu: null });
  row[day] = p;
}
const cell = p => p ? '<a href="#' + p.id + '">' + esc(p.title) + '</a><span>' + kindLabel[p.kind].split(',')[0].replace(' post', '') + '</span>' : '<span class="rest">No post</span>';

const articles = posts.map((p, i) => `
<article id="${p.id}">
  <div class="media${p.kind === 'video' ? ' is-video' : ''}">${media(p)}</div>
  <div class="copy">
    <div class="meta"><span class="when">${esc(p.when)}</span><span>${kindLabel[p.kind]}</span><span class="count">${chars(p.text)} / 3,000</span></div>
    <h3>${esc(p.title)}</h3>
    <p class="file">Upload <code>${esc(p.asset)}</code>${p.docTitle ? ' and title it <b>' + esc(p.docTitle) + '</b>' : ''}${p.kind === 'video' ? ', with <code>' + esc(p.preview || p.asset.replace('.mp4', '-cover.png')) + '</code> as the thumbnail' : ''}</p>
    <div class="label"><span>Post</span><button type="button" id="copy-post-${i}" data-copy="text-${i}">Copy post</button></div>
    <pre class="text" id="text-${i}">${body(p.text)}</pre>
    <div class="label"><span>First comment</span><button type="button" id="copy-comment-${i}" data-copy="comment-${i}">Copy comment</button></div>
    <pre class="text comment" id="comment-${i}">${esc(p.comment)}</pre>
  </div>
</article>`).join('\n');

const html = `<title>CutNest LinkedIn Kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600;700&display=swap">
<style>
:root{
  --bg:#edf2f2; --surface:#ffffff; --ink:#0a3a47; --text:#1d3a42; --muted:#557077; --line:#d2dfe1;
  --accent:#f59e0b; --on-accent:#0a3a47; --fold:#fdecc4; --fold-ink:#0a3a47; --code:#e3ecee; --btn:#0f4c5c; --on-btn:#ffffff;
  --display:"Barlow Condensed","Arial Narrow",Arial,sans-serif; --sans:Barlow,"Segoe UI",Roboto,Arial,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
  --bg:#06222a; --surface:#0b303a; --ink:#f1f7f7; --text:#d3e3e5; --muted:#8eacb2; --line:#1b4652;
  --fold:rgba(245,158,11,.18); --fold-ink:#fde2a6; --code:#113a45; --btn:#f59e0b; --on-btn:#0a3a47;}}
:root[data-theme="dark"]{color-scheme:dark;
  --bg:#06222a; --surface:#0b303a; --ink:#f1f7f7; --text:#d3e3e5; --muted:#8eacb2; --line:#1b4652;
  --fold:rgba(245,158,11,.18); --fold-ink:#fde2a6; --code:#113a45; --btn:#f59e0b; --on-btn:#0a3a47;}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text);font:16px/1.55 var(--sans);padding-inline:16px;padding-block:0 64px}
.wrap{max-width:1060px;margin:0 auto}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
h1,h2,h3{font-family:var(--display);color:var(--ink);text-wrap:balance;margin:0;line-height:1.02}
header{padding-block:44px 28px;display:grid;gap:14px;border-bottom:1px solid var(--line)}
.brand{font:800 15px/1 var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.brand b{color:var(--accent)}
h1{font-size:clamp(44px,8vw,76px);font-weight:900}
h1 em{font-style:normal;color:var(--accent)}
.lede{max-width:62ch;margin:0;font-size:18px}
section{padding-block:36px;border-bottom:1px solid var(--line);display:grid;gap:18px}
h2{font-size:32px;font-weight:800}
.tips{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px 32px;margin:0;padding:0;list-style:none;counter-reset:t}
.tips li{display:grid;gap:2px;align-content:start}
.tips b{font:700 19px/1.2 var(--display);color:var(--ink);letter-spacing:.01em}
.tips span{color:var(--text);font-size:15px}
.sched{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:10px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:700 13px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
td:first-child{font:800 18px/1.2 var(--display);color:var(--ink);white-space:nowrap}
td a{font-weight:600;color:var(--ink);text-decoration-color:var(--accent);text-underline-offset:3px;text-decoration-thickness:2px}
td span{display:block;font-size:13px;color:var(--muted)}
td .rest{font-style:italic}
.note{font-size:14px;color:var(--muted);margin:0}
article{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:36px;padding-block:40px;border-bottom:1px solid var(--line);scroll-margin-top:12px}
.media img,.media video{display:block;width:100%;max-width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:6px;background:#0a3a47;box-shadow:0 1px 0 var(--line),0 12px 30px -18px rgba(6,34,42,.55)}
.media{position:sticky;top:calc(env(safe-area-inset-top,0px) + 16px);align-self:start}
.copy{display:grid;gap:12px;min-width:0;align-content:start}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--muted);align-items:center}
.when{background:var(--accent);color:var(--on-accent);font:800 14px/1 var(--display);letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;border-radius:3px}
.count{margin-left:auto;font-variant-numeric:tabular-nums}
h3{font-size:36px;font-weight:900}
.file{margin:0;font-size:14px;color:var(--muted)}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);color:var(--ink);padding:1px 5px;border-radius:3px;overflow-wrap:anywhere}
.label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:6px}
.label span{font:700 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
button{font:700 14px/1 var(--sans);background:var(--btn);color:var(--on-btn);border:0;border-radius:4px;padding:9px 14px;cursor:pointer;min-width:132px}
button:hover{filter:brightness(1.12)}
button.done{background:var(--accent);color:var(--on-accent)}
pre.text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 var(--sans);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px 18px;max-width:64ch}
pre.comment{font-size:14px}
.fold{background:var(--fold);color:var(--fold-ink);font-weight:600;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:1px 3px;border-radius:2px}
.key{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--muted);margin:0}
footer{padding-block:32px 0;font-size:14px;color:var(--muted);max-width:68ch}
@media (max-width:760px){article{grid-template-columns:1fr;gap:22px}.media{position:static;max-width:420px}h3{font-size:30px}.count{margin-left:0}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
<div class="wrap">
<header>
  <div class="brand">Cut<b>Nest</b> &middot; LinkedIn</div>
  <h1>Six weeks of posts, <em>ready to go.</em></h1>
  <p class="lede">${posts.length} posts, twice a week. Every sheet and bar shown is a real layout from the CutNest engine, and both videos are captioned so they work with the sound off. Each post comes with its text and a first comment holding the link.</p>
</header>

<section>
  <h2>Before you post</h2>
  <ul class="tips">
    <li><b>Post from your own profile</b><span>People follow people. A new company page starts with no audience, so reshare from it later if you make one.</span></li>
    <li><b>Put the link in the first comment</b><span>LinkedIn shows posts with outside links to fewer people. Post, then add the comment straight away.</span></li>
    <li><b>The first line does the work</b><span>Only the highlighted opening shows before &ldquo;&hellip;see more&rdquo;. Keep it as written.</span></li>
    <li><b>Tuesday and Thursday, 8&ndash;9am</b><span>Trade audiences check LinkedIn before the day gets going. Stay around for the first hour.</span></li>
    <li><b>Reply to every comment</b><span>Comments in the first hour decide how far a post travels. A question back keeps the thread going.</span></li>
    <li><b>Carousels go up as a document</b><span>Choose &ldquo;Add a document&rdquo;, upload the PDF, and give it the title shown with the post.</span></li>
    <li><b>Set the video thumbnail</b><span>Upload the matching cover PNG so the feed shows a result, not a blank first frame.</span></li>
    <li><b>Ask for a real job</b><span>Message five people you know in the trade and ask them to try it on their last job. Their feedback becomes your first testimonials.</span></li>
  </ul>
</section>

<section>
  <h2>Schedule</h2>
  <div class="sched"><table>
    <thead><tr><th>Week</th><th>Tuesday</th><th>Thursday</th></tr></thead>
    <tbody>${weeks.map(r => '<tr><td>' + esc(r.w) + '</td><td>' + cell(r.Tue) + '</td><td>' + cell(r.Thu) + '</td></tr>').join('')}</tbody>
  </table></div>
  <p class="note">Links carry <code>utm_source=linkedin</code> and a campaign per post, so Google Analytics shows which posts brought visitors (for visitors who accept cookies).</p>
</section>

<section style="border-bottom:0;padding-bottom:0">
  <h2>The posts</h2>
  <p class="key"><span class="fold">Highlighted</span> text is what shows in the feed before &ldquo;&hellip;see more&rdquo;.</p>
</section>
${articles}

<footer>The images and videos are made from <code>marketing/</code> in the CutNest repo: <code>node marketing/data.js</code>, <code>build.js</code>, <code>video.js</code> and <code>walkthrough.js</code>. Post text lives in <code>posts.js</code>; <code>kit.js</code> rebuilds this page.</footer>
</div>
<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-copy]'); if (!b) return;
  var el = document.getElementById(b.getAttribute('data-copy'));
  var label = b.textContent;
  function done(t) { b.textContent = t; b.classList.add('done'); setTimeout(function () { b.textContent = label; b.classList.remove('done'); }, 1600); }
  function select() { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected, press Ctrl+C'); }
  try { navigator.clipboard.writeText(el.textContent).then(function () { done('Copied'); }, select); } catch (err) { select(); }
});
</script>
`;
fs.writeFileSync(path.join(OUT, 'kit.html'), html);
console.log('  marketing/out/linkedin-posts.md, marketing/out/kit.html (' + posts.length + ' posts)');
