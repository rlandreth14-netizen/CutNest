// Builds the LinkedIn kit from posts.js: out/linkedin-posts.md (plain copy)
// and out/kit.html (every asset beside its post text, with copy buttons).
// Run: node marketing/kit.js
'use strict';
const fs = require('fs'), path = require('path');
const posts = require('./posts.js');
const OUT = path.join(__dirname, 'out');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chars = s => [...s].length;
const CSS = fs.readFileSync(path.join(__dirname, 'kit.css'), 'utf8');

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
${CSS}</style>
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
