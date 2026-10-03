// YouTube walkthroughs: real screen recordings of the app and the website at
// 1920x1080, with a visible pointer, step captions, title and end cards.
// Writes marketing/out/youtube-<id>.mp4, youtube-<id>.json (chapter and line
// times) and youtube-<id>.srt (subtitles, from marketing/srt.js).
// Run: FFMPEG=/path/to/ffmpeg node marketing/youtube.js [id ...]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { chromium } = require(path.join(__dirname, '../node_modules/playwright'));
const { serve, OUT } = require('./build.js');
const srt = require('./srt.js');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// Voice-over (marketing/tts.py, Kokoro). VOICE=none records silent videos.
const VOICE = process.env.VOICE || 'bm_george';
const crypto = require('crypto');

// What the voice says at each step. A caption or card names its line; the
// next step waits until the line has finished.
const NARRATION = {
  walkthrough: {
    intro: "Welcome to CutNest. In the next minute, I'll take a real sheet metal job from a cut list to a finished customer quote.",
    material: "First, pick the material. Your library holds the sheet sizes you buy and what you pay for them. This job is two mil, three one six brushed stainless.",
    paste: "Next, paste in the cut list, straight from an email or a spreadsheet. CutNest reads most formats, so there's no retyping.",
    calc: "Hit calculate. It's a brushed finish, so the grain is locked and no part gets turned.",
    order: "Here's exactly what to order, and what it'll cost. Two sheets, and CutNest has proved that no layout can do it in fewer.",
    sheets: "Every sheet is drawn to scale, with the parts labelled and any usable offcuts marked, ready for the shop floor.",
    quote: "Now turn it into a quote. With Pro, the cutting time comes from the actual layout, at your own rates and markup. Add the customer, and any extras, like delivery.",
    doc: "And there's your quote, on your own letterhead, ready to print, or send as a PDF.",
    end: "CutNest is free to try in your browser, with no account. Head to cutnest dot co dot uk.",
  },
  bars: {
    intro: "Cutting box section for a frame? Here's how CutNest gets every length out of the fewest bars.",
    section: "Choose the section. This is forty by forty box, which comes in six metre and seven and a half metre lengths.",
    lengths: "Paste in the lengths you need, with the quantities.",
    calc: "Calculate. CutNest mixes the stock lengths to find the cheapest plan.",
    order: "Here's what to order, and what it costs. And it's proved optimal. No plan uses fewer bars.",
    plan: "Every bar gets its own cutting plan, and offcuts long enough to keep are marked, so they go on the rack, not in the skip.",
    end: "Bar and tube cutting is free on every plan. Try it at cutnest dot co dot uk.",
  },
  calculator: {
    intro: "How many sheets do you actually need? Most people divide the total area by the area of a sheet. Here's why that comes up short.",
    short: "This is a kitchen carcass job on eight by four MDF. The area sum says two sheets. Nested properly, it needs three. Order two, and you're a sheet short on the day.",
    yours: "Put in your own sheet size, your blade's kerf, and what you pay per sheet. Tap a standard size to compare, like ten by four.",
    grain: "Using veneered or woodgrain board? Untick parts can turn, and every panel keeps the grain running the same way.",
    app: "When you're happy, open the job in the full app, for cut sheets, labels and quotes.",
    end: "The calculators are free, with no sign up, at cutnest dot co dot uk.",
  },
};

// Make (or reuse) the clips for one video: { key: { file, dur } }.
function voiceClips(name) {
  const lines = NARRATION[name];
  if (!lines || VOICE === 'none') return {};
  const dir = path.join(OUT, 'voice', VOICE);
  fs.mkdirSync(dir, { recursive: true });
  const job = Object.entries(lines).map(([key, text]) => ({ key, text,
    file: path.join(dir, crypto.createHash('sha1').update(text).digest('hex').slice(0, 16) + '.wav') }));
  const r = spawnSync('python3', [path.join(__dirname, 'tts.py')], { input: JSON.stringify({ voice: VOICE, lines: job }), encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error('tts.py failed: ' + r.stderr);
  const durs = JSON.parse(r.stdout.trim().split('\n').pop());
  const out = {};
  job.forEach(j => { out[j.key] = { file: j.file, dur: durs[j.file], text: j.text }; });
  return out;
}

const STYLE = `
  #yt-cap{position:fixed;left:24px;bottom:22px;z-index:99999;display:flex;align-items:center;gap:12px;max-width:calc(100% - 48px);
    background:rgba(10,58,71,.95);border-left:5px solid #f59e0b;color:#fff;border-radius:10px;padding:10px 20px 10px 14px;
    font-family:"Barlow Condensed",sans-serif;font-weight:800;font-size:27px;line-height:1.15;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .25s}
  #yt-cap:empty{opacity:0}
  #yt-cap b{background:#f59e0b;color:#0a3a47;border-radius:50%;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0}
  #yt-cap small{display:block;font-family:"Barlow",sans-serif;font-weight:500;font-size:16px;color:rgba(255,255,255,.75);margin-top:2px}
  #yt-card{position:fixed;inset:0;z-index:100001;background:radial-gradient(120% 90% at 85% 0%,#14576a 0%,#0a3a47 55%,#072a33 100%);color:#fff;
    display:none;flex-direction:column;justify-content:center;padding:0 110px;font-family:"Barlow Condensed",sans-serif}
  #yt-card .k{font-size:24px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#f59e0b;margin-bottom:14px}
  #yt-card h1{font-size:96px;font-weight:900;line-height:.95;margin:0 0 22px;max-width:1000px}
  #yt-card h1 em{font-style:normal;color:#f59e0b}
  #yt-card p{font-family:"Barlow",sans-serif;font-size:26px;color:rgba(255,255,255,.82);max-width:860px;line-height:1.4;margin:0 0 30px}
  #yt-card .url{align-self:flex-start;background:#f59e0b;color:#0a3a47;font-size:46px;font-weight:900;padding:8px 26px;border-radius:12px}
  #yt-card .brand{position:absolute;left:110px;top:64px;display:flex;align-items:center;gap:12px;font-size:34px;font-weight:900}
  #yt-card .brand span{color:#f59e0b}
  #yt-ptr{position:fixed;left:0;top:0;z-index:100000;width:26px;height:26px;pointer-events:none;transform:translate(-100px,-100px);
    filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  #yt-ring{position:fixed;z-index:99998;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f59e0b;pointer-events:none;opacity:0}
  #yt-ring.go{animation:ytring .45s ease-out}
  @keyframes ytring{from{opacity:1;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}
  #yt-doc{position:fixed;inset:0;z-index:99990;background:rgba(7,42,51,.82);display:none;justify-content:center;align-items:flex-start;overflow:hidden}
  #yt-doc iframe{width:900px;height:2400px;border:0;background:#fff;margin-top:60px;box-shadow:0 30px 80px rgba(0,0,0,.5);border-radius:4px;transition:transform 2.6s ease-in-out}
  .toast{display:none!important}`;
const BRAND = '<div class="brand"><svg width="44" height="44" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#0f4c5c"/><rect x="4" y="4" width="13" height="9" rx="2" fill="#f59e0b"/><rect x="19" y="4" width="13" height="15" rx="2" fill="#fff" opacity=".9"/><rect x="4" y="15" width="13" height="17" rx="2" fill="#fff" opacity=".9"/><rect x="19" y="21" width="13" height="11" rx="2" fill="#f59e0b" opacity=".8"/></svg><div>Cut<span>Nest</span></div></div>';
const END = { k: 'Free to try', h: 'Your next job, <em>nested before you order.</em>', p: 'Sheet, bar &amp; tube. In your browser, no account. Pro adds quotes, labels, DXF and grain lock.' };

async function setup(page) {
  await page.addStyleTag({ content: STYLE });
  await page.evaluate(() => {
    const add = (id, html, tag) => { if (document.getElementById(id)) return; const e = document.createElement(tag || 'div'); e.id = id; if (html) e.innerHTML = html; document.body.appendChild(e); };
    add('yt-cap'); add('yt-card'); add('yt-ring'); add('yt-doc', '<iframe></iframe>');
    add('yt-ptr', '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2 L3 21 L8.5 16 L12 24 L15.5 22.5 L12 15 L19.5 15 Z" fill="#fff" stroke="#0a3a47" stroke-width="1.8" stroke-linejoin="round"/></svg>');
    document.addEventListener('mousemove', e => { document.getElementById('yt-ptr').style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
  });
}

async function record(page, name, script) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [], marks = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnyt-'));
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  let pos = { x: 640, y: 360 };
  const wait = ms => page.waitForTimeout(ms);
  const now = () => Date.now() / 1000;
  const clips = voiceClips(name), spoken = [];
  let speakUntil = 0, pending = null;
  const h = {
    wait,
    // Start a narration line; the next caption or card waits for it to end.
    say(key) {
      const c = clips[key];
      if (!c) return;
      spoken.push({ file: c.file, at: now(), dur: c.dur, text: c.text });
      speakUntil = now() + c.dur;
    },
    async hush(gapMs) {
      const left = speakUntil - now();
      if (left > 0 || speakUntil) await wait(Math.max(0, left * 1000) + (gapMs == null ? 350 : gapMs));
      speakUntil = 0;
    },
    async caption(n, text, sub, line) {
      await h.hush();
      h.mark();
      if (line) h.say(line);
      await page.evaluate(([n, t, s]) => { document.getElementById('yt-cap').innerHTML = t ? (n ? '<b>' + n + '</b>' : '') + '<div>' + t + (s ? '<small>' + s + '</small>' : '') + '</div>' : ''; }, [n, text, sub || '']);
    },
    // A chapter starts when its caption or card appears (after the last line ends).
    chapter(title) { pending = title; },
    mark() { if (pending) { marks.push({ title: pending, at: now() }); pending = null; } },
    async card(c, ms, line) {
      await h.hush();
      h.mark();
      if (line) h.say(line);
      await page.evaluate(c => { const e = document.getElementById('yt-card'); e.innerHTML = c; e.style.display = 'flex'; }, BRAND + '<div class="k">' + c.k + '</div><h1>' + c.h + '</h1>' + (c.p ? '<p>' + c.p + '</p>' : '') + (c.url !== false ? '<div class="url">cutnest.co.uk</div>' : ''));
      await wait(ms);
      await h.hush(700);
    },
    async hideCard() { await page.evaluate(() => { document.getElementById('yt-card').style.display = 'none'; }); },
    async point(sel, opt) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      const x = b.x + b.width * ((opt && opt.fx) || 0.5), y = b.y + b.height * ((opt && opt.fy) || 0.5);
      const steps = Math.max(8, Math.round(Math.hypot(x - pos.x, y - pos.y) / 18));
      await page.mouse.move(x, y, { steps });
      pos = { x, y };
      await wait(120);
    },
    async click(sel, opt) {
      await h.point(sel, opt);
      await page.evaluate(([x, y]) => { const r = document.getElementById('yt-ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); }, [pos.x, pos.y]);
      await page.mouse.down(); await page.mouse.up();
      await wait(250);
    },
    async type(sel, text, delay) { await h.click(sel); await page.keyboard.type(text, { delay: delay || 45 }); },
    async scroll(sel, offset) {
      await page.evaluate(([s, o]) => { const el = document.querySelector(s); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (o || 90), behavior: 'smooth' }); }, [sel, offset]);
      await wait(900);
    },
    async scrollBy(dy, ms) { await page.evaluate(dy => window.scrollBy({ top: dy, behavior: 'smooth' }), dy); await wait(ms || 900); },
    async doc(html, holdTop, holdScrolled, scrollTo) {
      await page.evaluate(html => { const d = document.getElementById('yt-doc'); const f = d.querySelector('iframe'); f.style.transform = 'translateY(0)'; f.srcdoc = html; d.style.display = 'flex'; }, html);
      await wait(holdTop);
      await page.evaluate(y => { document.querySelector('#yt-doc iframe').style.transform = 'translateY(-' + y + 'px)'; }, scrollTo || 520);
      await wait(holdScrolled);
    },
    async hideDoc() { await page.evaluate(() => { document.getElementById('yt-doc').style.display = 'none'; }); },
  };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await wait(300);
  await script(h);
  const stopAt = now();
  await cdp.send('Page.stopScreencast');
  await wait(200);
  // Chapter times on the video clock: screencast timestamps are wall-clock
  // seconds, and the first frame is 0:00.
  const first = frames[0].ts;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    // The screencast only sends a frame when the picture changes, so the last
    // frame lasts until recording stopped (an end card is a still).
    const d = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].ts - f.ts) : Math.max(0.5, stopAt - f.ts);
    lines.push("file '" + f.file + "'", 'duration ' + d.toFixed(4));
  });
  lines.push("file '" + frames[frames.length - 1].file + "'");
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const file = path.join(OUT, 'youtube-' + name + '.mp4');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a3a47,fps=30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  const dur = Math.max(stopAt, frames[frames.length - 1].ts + 0.5) - first;
  if (spoken.length) {
    // Lay each line at the moment it was said, on the same clock as the frames.
    const tmp = file.replace(/\.mp4$/, '.voiced.mp4');
    const args = ['-y', '-loglevel', 'error', '-i', file];
    spoken.forEach(s => args.push('-i', s.file));
    const chains = spoken.map((s, i) => { const ms = Math.max(0, Math.round((s.at - first) * 1000)); return '[' + (i + 1) + ':a]adelay=' + ms + '|' + ms + '[a' + i + ']'; });
    const mix = spoken.map((s, i) => '[a' + i + ']').join('') + 'amix=inputs=' + spoken.length + ':normalize=0:duration=longest,apad,atrim=0:' + dur.toFixed(2) + ',loudnorm=I=-16:TP=-1.5[aout]';
    args.push('-filter_complex', chains.concat(mix).join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', tmp);
    const a = spawnSync(FFMPEG, args, { stdio: 'inherit' });
    if (a.status !== 0) throw new Error('ffmpeg audio mix failed');
    fs.renameSync(tmp, file);
  }
  fs.writeFileSync(path.join(OUT, 'youtube-' + name + '.json'), JSON.stringify({ duration: Math.round(dur), chapters: marks.map(m => ({ title: m.title, t: Math.max(0, Math.round(m.at - first)) })),
    lines: spoken.map(s => ({ text: s.text, t: +Math.max(0, s.at - first).toFixed(3), dur: +s.dur.toFixed(3) })) }, null, 1));
  srt.write(OUT, name);
  console.log('  youtube-' + name + '.mp4', dur.toFixed(1) + 's', Math.round(fs.statSync(file).size / 1024) + 'KB');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function appPage(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' });
  await ctx.route('https://api.lemonsqueezy.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ valid: true, activated: true, instance: { id: 'i1' }, license_key: { status: 'active' }, meta: { store_id: 394602 } }) }));
  await ctx.route(u => !u.href.startsWith(base) && u.hostname !== 'api.lemonsqueezy.com', r => r.abort());
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('yt')) return; sessionStorage.setItem('yt', '1');
    localStorage.setItem('cn-cookie', 'declined');
    localStorage.setItem('cutnest-settings-v1', JSON.stringify({ kerf: 4, kerfTouched: true, companyName: 'Harper Fabrications Ltd',
      quote: { business: { address: 'Unit 7, Forge Road\nNewcastle NE6 2XX', phone: '0191 496 0000', email: 'sales@harperfab.co.uk', web: '', taxNo: '' } } }));
    localStorage.setItem('cutnest-licence-v1', JSON.stringify({ key: 'ABCD1234-EF56-7890-ABCD-1234567890AB', verified: true, lastCheck: new Date().toISOString() }));
  });
  const page = await ctx.newPage();
  await page.goto(base + '/app.html');
  await page.waitForFunction(() => isPro && library.length > 20);
  return page;
}
const calcDone = page => page.waitForFunction(() => !_calcBusy && document.getElementById('output').style.display === 'block', null, { timeout: 30000 });

const VIDEOS = {
  // Sheet metal job, from a pasted cut list to a printed customer quote.
  async walkthrough(browser, base) {
    const page = await appPage(browser, base);
    await page.evaluate(() => { mats = [{ id: 'mat-1', selectedMatId: null, pieces: [{ w: '', h: '', qty: 1, label: '' }] }]; document.getElementById('job-ref').value = 'JOB-118'; renderAll(); scrollTo(0, 0); });
    await setup(page);
    await record(page, 'walkthrough', async h => {
      h.chapter('Intro');
      await h.card({ k: 'Walkthrough · sheet metal', h: 'Cut list to <em>customer quote</em>', p: 'A real job in CutNest: 316 brushed stainless, from a pasted cut list to a quote on your letterhead.', url: false }, 3800, 'intro');
      await h.hideCard();
      h.chapter('Choose the material');
      await h.caption(1, 'Choose the material', 'Your library holds your sheet sizes and prices', 'material');
      await h.wait(900);
      await h.click('select[aria-label="Material 1"]');
      await page.selectOption('select[aria-label="Material 1"]', '205');
      await h.wait(1800);
      h.chapter('Paste the cut list');
      await h.caption(2, 'Paste the cut list', 'Straight from an email or spreadsheet. Most formats work.', 'paste');
      await h.click('text=Paste list');
      await page.evaluate(() => document.getElementById('paste-input').scrollIntoView({ block: 'center' }));
      await h.type('#paste-input', 'Door panel 715 x 497 x 4\nSide panel 900 x 420 x 4\nTop 1200 x 450 x 2\nKick plate 1200 x 150 x 2\nBracket 200 x 120 x 12', 32);
      await h.wait(1300);
      await h.click('#paste-confirm');
      await h.wait(1200);
      h.chapter('Calculate');
      await h.caption(3, 'Calculate', 'Brushed finish: the grain is locked, so no part turns', 'calc');
      await h.click('#calc-btn');
      await calcDone(page);
      await h.wait(400);
      h.chapter('What to order, and the cost');
      await h.caption(4, 'What to order, and what it costs', 'Checked against a lower bound: proved optimal when it says so', 'order');
      await h.scroll('#order-line', 100);
      await h.wait(3200);
      h.chapter('Every sheet drawn to scale');
      await h.caption(5, 'Every sheet drawn to scale', 'Numbered parts, usable offcuts marked', 'sheets');
      await h.scroll('#mat-visuals .sheet-vis', 80);
      await h.wait(2600);
      await h.scrollBy(380, 2200);
      h.chapter('Turn it into a quote');
      await h.caption(6, 'Turn it into a customer quote', 'Pro: cutting time from the actual layout, your rates and markup', 'quote');
      await page.evaluate(() => scrollTo({ top: 0 }));
      await h.wait(300);
      await h.scroll('.quote-cta', 220);
      await h.click('.quote-cta');
      await h.wait(900);
      await h.type('#q-customer', 'Tyne Joinery Ltd', 45);
      await h.wait(600);
      await page.evaluate(() => document.querySelector('#quote-modal .modal').scrollTo({ top: 700, behavior: 'smooth' }));
      await h.wait(1300);
      await h.click('text=+ Add a line');
      await h.type('#q-extras .q-extra input >> nth=0', 'Delivery', 45);
      await h.type('#q-extras .q-extra input >> nth=1', '35', 90);
      await h.wait(700);
      await page.evaluate(() => { const m = document.querySelector('#quote-modal .modal'); m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }); });
      await h.wait(2400);
      h.chapter('The finished quote');
      await h.caption(7, 'Your quote, on your letterhead', 'Print it or save it as a PDF and send it', 'doc');
      await h.doc(await page.evaluate(() => buildQuoteHtml()), 2600, 3400, 560);
      await h.hideDoc();
      await h.caption(0, '');
      h.chapter('Try it free');
      await h.card(END, 4200, 'end');
    });
    await page.context().close();
  },

  // Bar and box section: cut to length from the fewest bars.
  async bars(browser, base) {
    const page = await appPage(browser, base);
    await page.evaluate(() => { mats = [{ id: 'mat-1', selectedMatId: null, pieces: [{ w: '', h: '', qty: 1, label: '' }] }]; document.getElementById('job-ref').value = 'FRM-022'; renderAll(); scrollTo(0, 0); });
    await setup(page);
    await record(page, 'bars', async h => {
      h.chapter('Intro');
      await h.card({ k: 'Bar, tube &amp; extrusion', h: 'Cut to length from <em>the fewest bars</em>', p: 'Box section for a frame: stock lengths, saw kerf, and a saw list for every bar.', url: false }, 3600, 'intro');
      await h.hideCard();
      h.chapter('Choose the section');
      await h.caption(1, 'Choose the section', 'SHS 40×40×3 in 6m and 7.5m lengths, with prices', 'section');
      await h.wait(800);
      await h.click('select[aria-label="Material 1"]');
      await page.selectOption('select[aria-label="Material 1"]', '801');
      await h.wait(1800);
      h.chapter('Enter the lengths');
      await h.caption(2, 'Enter the lengths you need', '', 'lengths');
      await h.click('text=Paste list');
      await page.evaluate(() => document.getElementById('paste-input').scrollIntoView({ block: 'center' }));
      await h.type('#paste-input', 'Top rail 2400 x 4\nLeg 900 x 8\nBrace 650 x 6\nStub 300 x 6', 38);
      await h.wait(1200);
      await h.click('#paste-confirm');
      await h.wait(1000);
      h.chapter('Calculate');
      await h.caption(3, 'Calculate', 'It mixes 6m and 7.5m bars to find the cheapest plan', 'calc');
      await h.click('#calc-btn');
      await calcDone(page);
      await h.wait(300);
      h.chapter('What to order');
      await h.caption(4, 'What to order, and the cost', '', 'order');
      await h.scroll('#order-line', 100);
      await h.wait(3000);
      h.chapter('The cutting plan');
      await h.caption(5, 'A cutting plan for every bar', 'Offcuts worth keeping are marked', 'plan');
      await h.scroll('#mat-visuals', 80);
      await h.wait(2800);
      await h.scrollBy(360, 2600);
      await h.caption(0, '');
      h.chapter('Try it free');
      await h.card({ k: 'Free on every plan', h: 'Bar &amp; tube cutting, <em>free.</em>', p: 'Box section, angle, flat bar, extrusion and timber. In your browser, no account.' }, 4200, 'end');
    });
    await page.context().close();
  },

  // The free calculator on the website.
  async calculator(browser, base) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' });
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    await ctx.addInitScript(() => localStorage.setItem('cn-cookie', 'declined'));
    const page = await ctx.newPage();
    await page.goto(base + '/plywood-cut-list-calculator.html');
    await page.waitForSelector('.cnd-head', { timeout: 30000 });
    await page.evaluate(() => { const s = document.querySelector('.pg-calc'); scrollTo(0, s.getBoundingClientRect().top + scrollY - 10); });
    await setup(page);
    await record(page, 'calculator', async h => {
      h.chapter('Intro');
      await h.card({ k: 'Free calculator', h: 'How many sheets <em>do I need?</em>', p: 'Why total area &divide; sheet area comes up short, and a free calculator that nests the parts properly.', url: false }, 3800, 'intro');
      await h.hideCard();
      h.chapter('The area sum is short');
      await h.caption(1, 'A kitchen carcass job on 8×4 MDF', 'The area sum says 2 sheets. Nested properly, it needs 3.', 'short');
      await h.point('.cnd-cmp');
      await h.wait(3600);
      h.chapter('Your sheet, your kerf, your price');
      await h.caption(2, 'Your sheet size, kerf and price', '', 'yours');
      await h.type('[data-s="p"]', '32', 120);
      await h.click('.cnd-go');
      await h.wait(1600);
      await h.click('.cnd-chip >> text=10×4');
      await h.wait(2400);
      await h.click('.cnd-chip >> text=8×4');
      await h.wait(1400);
      h.chapter('Grain');
      await h.caption(3, 'Veneered or woodgrain board?', 'Untick “Parts can turn” and every panel keeps the grain', 'grain');
      await h.click('[data-s="rot"]');
      await h.wait(3000);
      h.chapter('Open it in the app');
      await h.caption(4, 'Open the job in the full app', 'Cut sheets for the saw, labels and quotes', 'app');
      await h.point('.cnd-open');
      await h.wait(2400);
      await h.caption(0, '');
      h.chapter('Try it free');
      await h.card({ k: 'Free · no sign-up', h: 'Nest it <em>before you order it.</em>', p: 'Sheet, board and bar calculators at cutnest.co.uk' }, 4200, 'end');
    });
    await ctx.close();
  },
};

// Thumbnails (1280x720), channel banner (2560x1440) and profile picture (800x800).
async function thumbs(browser, base) {
  const sizes = { walkthrough: [1280, 720], bars: [1280, 720], calculator: [1280, 720], banner: [2560, 1440], avatar: [800, 800] };
  for (const [id, [w, hgt]] of Object.entries(sizes)) {
    const page = await browser.newPage({ viewport: { width: w, height: hgt } });
    await page.goto(base + '/marketing/thumbs.html?t=' + id);
    await page.waitForSelector('body[data-ready]');
    const file = id === 'banner' || id === 'avatar' ? 'youtube-channel-' + id + '.png' : 'youtube-' + id + '-thumbnail.png';
    await (await page.$('.th')).screenshot({ path: path.join(OUT, file) });
    console.log('  ' + file);
    await page.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIDEOS).concat('thumbs');
  VIDEOS.thumbs = thumbs;
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  for (const id of which) await VIDEOS[id](browser, base);
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
