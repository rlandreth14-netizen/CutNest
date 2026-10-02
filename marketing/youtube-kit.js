// Builds the YouTube kit: out/youtube-kit.html (channel set-up steps, then each
// video with its thumbnail, title, description and tags to copy) and
// out/youtube-uploads.md (the same text, plain).
// Run after youtube.js: node marketing/youtube-kit.js
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out');
const CSS = fs.readFileSync(path.join(__dirname, 'kit.css'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (c, p) => 'https://cutnest.co.uk' + (p || '/') + '?utm_source=youtube&utm_medium=video&utm_campaign=' + c;
const mmss = t => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const meta = id => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'youtube-' + id + '.json'), 'utf8')); } catch (e) { return null; } };

const FOOT = `CutNest is a cut list optimiser for sheet metal, timber, acrylic, bar and tube. It runs in your browser: free, no account, and your cut lists stay on your computer. Pro (£12/month + VAT per company) adds customer quotes, labels, DXF export and grain lock.

Built by a fabricator in Newcastle upon Tyne.`;

const CHANNEL_ABOUT = `Cut lists for sheet, bar and tube, from a fabricator in Newcastle upon Tyne.

CutNest works out the fewest sheets or bars for a job before you order, draws every sheet to scale, and turns the layout into a customer quote. Short walkthroughs and ordering tips for fabricators, joiners and sign makers.

Free to use in your browser: https://cutnest.co.uk`;

// YouTube shows chapters only with three or more, each at least 10 seconds,
// so the short videos list their steps without timestamps.
const videos = [
  {
    id: 'walkthrough', file: 'youtube-walkthrough.mp4', thumb: 'youtube-walkthrough-thumbnail.png',
    when: 'Upload day', kind: 'Video, 16:9',
    title: 'Sheet Metal Cut List to Customer Quote in Under a Minute | CutNest',
    chapters: [[0, 'Paste a cut list'], [16, 'What to order and what it costs'], [28, 'Build the customer quote'], [40, 'The finished quote']],
    desc: `A real sheet metal job in CutNest: 316 brushed stainless, from a pasted cut list to a quote on your letterhead.

Try it free, no account: ${link('walkthrough')}

{chapters}

What you see:
• Paste the cut list straight from an email or spreadsheet
• The fewest sheets on the sizes you buy, with the grain locked for a brushed finish
• Proved optimal when no layout can use fewer sheets
• Every sheet drawn to scale
• A customer quote with cutting time from the actual layout, your rates and markup

${FOOT}`,
    tags: 'cut list optimiser, sheet metal nesting, sheet metal quoting, nesting software, fabrication software, cut list, laser cutting quote, stainless steel, fabricator',
  },
  {
    id: 'bars', file: 'youtube-bars.mp4', thumb: 'youtube-bars-thumbnail.png',
    when: 'Upload day', kind: 'Video, 16:9',
    title: 'Cut Box Section From the Fewest Bars: Free Cutting Plan | CutNest',
    desc: `Box section for a frame: enter the lengths you need and CutNest finds the fewest bars, with a cutting plan for every bar and the offcuts worth keeping.

Try the free cut length calculator: ${link('bars', '/bar-cutting-calculator.html')}

In this video:
1. Choose the section (SHS 40×40×3 in 6m and 7.5m lengths)
2. Paste the lengths you need
3. Calculate: it picks the cheapest mix of stock lengths
4. What to order, the cost, and a plan for every bar

Works for box section, angle, flat bar, aluminium extrusion and timber. Free on every plan.

${FOOT}`,
    tags: 'cutting stock, bar cutting calculator, cut length calculator, linear cutting optimizer, box section, steel fabrication, saw cut list, 1D cutting',
  },
  {
    id: 'calculator', file: 'youtube-calculator.mp4', thumb: 'youtube-calculator-thumbnail.png',
    when: 'Upload day', kind: 'Video, 16:9',
    title: 'How Many Sheets Do I Need? Free Plywood & MDF Calculator',
    desc: `Total area ÷ sheet area says 2 sheets. The job needs 3. This free calculator nests your parts on the board size you buy, with your blade kerf and grain, and gives the real number.

Free calculator: ${link('calculator', '/plywood-cut-list-calculator.html')}
Sheet metal version: ${link('calculator', '/sheet-calculator.html')}

In this video:
1. A kitchen carcass job on 8×4 MDF: the area sum is a sheet short
2. Your sheet size, kerf and price
3. Grain: stop panels turning for veneered or woodgrain board
4. Open the job in the full app for cut sheets, labels and quotes

${FOOT}`,
    tags: 'how many sheets of plywood, plywood calculator, MDF cut list, cut list calculator, sheet calculator, kitchen carcass cut list, woodworking, joinery',
  },
  {
    id: 'short-overview', file: 'video-30s-overview.mp4', thumb: 'video-30s-overview-cover.png',
    when: 'Week 2', kind: 'Short, vertical',
    title: 'Still working out sheet orders on a calculator? #shorts',
    desc: `The area sum says one thing, the real nest says another. CutNest nests your parts before you order, proves the minimum when it can, and turns the layout into a quote.

Free: ${link('short-overview')}

#fabrication #sheetmetal #joinery`,
    tags: 'shorts, sheet metal, fabrication, cut list',
  },
  {
    id: 'short-walkthrough', file: 'video-app-walkthrough.mp4', thumb: 'video-app-walkthrough-cover.png',
    when: 'Week 3', kind: 'Short, vertical',
    title: 'Cut list to customer quote on a phone #shorts',
    desc: `Paste a cut list, calculate, and quote it. Recorded on a phone.

Free: ${link('short-walkthrough')}

#fabrication #joinery #smallbusiness`,
    tags: 'shorts, cut list, quoting, fabrication',
  },
];
for (const v of videos) {
  const m = meta(v.id);
  if (v.chapters && m) v.chapters = v.chapters.filter(c => c[0] < m.duration - 10);
  v.desc = v.desc.replace('{chapters}', v.chapters ? v.chapters.map(c => mmss(c[0]) + ' ' + c[1]).join('\n') : '');
}

const steps = [
  ['Create the channel', 'Sign in to youtube.com with the Google account you use for Search Console. You already have a personal channel there, so click your profile picture, then <b>Settings &rarr; Add or manage your channel(s) &rarr; Create a channel</b>. Name it <b>CutNest</b> and pick the handle <b>@cutnest</b> (or <b>@cutnestuk</b> if that is taken). This makes a Brand Account channel: separate from your personal one, with nothing that links the two, and you can add other owners or managers later. Before uploading or replying to comments, check the picture at the top right shows CutNest, not you.'],
  ['Verify it with your phone', 'In YouTube Studio go to <b>Settings &rarr; Channel &rarr; Feature eligibility</b> and verify with a phone number. You need this to upload your own thumbnails. It can take a day to switch on.'],
  ['Profile picture and banner', 'In Studio, <b>Customisation &rarr; Branding</b>. Upload <code>youtube-channel-avatar.png</code> as the picture and <code>youtube-channel-banner.png</code> as the banner. The banner&rsquo;s text sits in the middle strip that shows on phones, TVs and desktops.'],
  ['Description and links', 'In <b>Customisation &rarr; Basic info</b>, paste the channel description below, add a link to <b>cutnest.co.uk</b> and your LinkedIn page, and set the contact email to hello@cutnest.co.uk.'],
  ['Upload the three videos', 'Upload all three on the same day so the channel has something to watch from the start. For each one: the title, description and tags below, the matching thumbnail, <b>No, it&rsquo;s not made for kids</b>, category <b>Science &amp; Technology</b>, and a playlist called <b>How to use CutNest</b>.'],
  ['Add music (optional, recommended)', 'The videos are silent, with captions on screen. In Studio open the video, choose <b>Editor &rarr; Audio</b>, and pick a calm track from the free Audio Library. Tracks from there are cleared for YouTube and will not get a copyright claim.'],
  ['End screen', 'In <b>Editor &rarr; End screen</b>, add a Subscribe button and &ldquo;Best for viewer&rdquo; video over the closing cutnest.co.uk card.'],
  ['Shorts', 'Upload the two vertical LinkedIn videos as Shorts on the weeks shown. Any vertical video under a minute counts as a Short.'],
];

// ── Markdown ──
const md = ['# CutNest on YouTube: upload text', '', '## Channel description', '', '```text', CHANNEL_ABOUT, '```', ''];
for (const v of videos) md.push('## ' + v.title, '', 'File: `' + v.file + '`  \nThumbnail: `' + v.thumb + '`', '', 'Description:', '', '```text', v.desc, '```', '', 'Tags:', '', '```text', v.tags, '```', '');
fs.writeFileSync(path.join(OUT, 'youtube-uploads.md'), md.join('\n'));

// ── Page ──
const box = (id, label, text, extra) => `<div class="label"><span>${label}</span><button type="button" id="copy-${id}" data-copy="${id}">Copy ${label.toLowerCase()}</button></div>
    <pre class="text${extra || ''}" id="${id}">${esc(text)}</pre>`;
const articles = videos.map((v, i) => `
<article id="${v.id}">
  <div class="media is-video"><video controls muted playsinline preload="metadata" poster="${esc(v.thumb)}" src="${esc(v.file)}"></video>
    <p class="file" style="margin-top:10px">Thumbnail: <code>${esc(v.thumb)}</code></p></div>
  <div class="copy">
    <div class="meta"><span class="when">${esc(v.when)}</span><span>${esc(v.kind)}</span><span class="count">${[...v.title].length} / 100</span></div>
    <h3>${esc(v.title.replace(/ \| CutNest$| #shorts$/, ''))}</h3>
    <p class="file">Upload <code>${esc(v.file)}</code></p>
    ${box('t' + i, 'Title', v.title, ' comment')}
    ${box('d' + i, 'Description', v.desc)}
    ${box('g' + i, 'Tags', v.tags, ' comment')}
  </div>
</article>`).join('\n');

const html = `<title>CutNest YouTube Kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600;700&display=swap">
<style>
${CSS}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:16px;counter-reset:s;max-width:76ch}
.steps li{display:grid;grid-template-columns:36px 1fr;gap:4px 14px;counter-increment:s}
.steps li::before{content:counter(s);grid-row:span 2;width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--on-accent);font:800 18px/32px var(--display);text-align:center}
.steps b{color:var(--ink)}
.steps strong{font:700 19px/1.2 var(--display);color:var(--ink);letter-spacing:.01em}
.steps span{font-size:15px}
.art{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start}
.art figure{margin:0;display:grid;gap:6px}
.art img{width:100%;border-radius:6px;display:block;box-shadow:0 1px 0 var(--line)}
.art figcaption{font-size:13px;color:var(--muted)}
.media.is-video video{aspect-ratio:auto}
</style>
<div class="wrap">
<header>
  <div class="brand">Cut<b>Nest</b> &middot; YouTube</div>
  <h1>Your channel, <em>ready to upload.</em></h1>
  <p class="lede">Three walkthroughs recorded from the real app and the free calculators, two Shorts from the LinkedIn kit, thumbnails, channel art, and the text for every upload. The set-up takes about half an hour.</p>
</header>

<section>
  <h2>Set up the channel</h2>
  <ol class="steps">${steps.map(s => '<li><strong>' + s[0] + '</strong><span>' + s[1] + '</span></li>').join('')}</ol>
</section>

<section>
  <h2>Channel art and description</h2>
  <div class="art">
    <figure><img src="youtube-channel-banner.png" alt="Channel banner"><figcaption><code>youtube-channel-banner.png</code> &middot; 2560&times;1440</figcaption></figure>
    <figure style="max-width:200px"><img src="youtube-channel-avatar.png" alt="Profile picture"><figcaption><code>youtube-channel-avatar.png</code> &middot; 800&times;800</figcaption></figure>
  </div>
  <div class="copy" style="max-width:68ch">${box('about', 'Description', CHANNEL_ABOUT)}</div>
</section>

<section style="border-bottom:0;padding-bottom:0">
  <h2>The videos</h2>
  <p class="note">Links carry <code>utm_source=youtube</code>, so Google Analytics shows visits from each video (for visitors who accept cookies).</p>
</section>
${articles}

<footer>Made by <code>marketing/youtube.js</code> (recordings, thumbnails, channel art) and <code>marketing/youtube-kit.js</code> (this page) in the CutNest repo.</footer>
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
fs.writeFileSync(path.join(OUT, 'youtube-kit.html'), html);
console.log('  marketing/out/youtube-uploads.md, marketing/out/youtube-kit.html (' + videos.length + ' videos)');
