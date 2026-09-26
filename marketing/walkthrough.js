// A real screen recording of the app (phone layout, 4:5), with step captions.
// Frames come from Chrome's screencast with their timestamps, then ffmpeg makes
// an H.264 MP4. Run: FFMPEG=/path/to/ffmpeg node marketing/walkthrough.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { chromium } = require(path.join(__dirname, '../node_modules/playwright'));
const { serve, OUT } = require('./build.js');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 432, height: 540 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://api.lemonsqueezy.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ valid: true, activated: true, instance: { id: 'i1' }, license_key: { status: 'active' }, meta: { store_id: 394602 } }) }));
  await ctx.route(u => !u.href.startsWith(base) && u.hostname !== 'api.lemonsqueezy.com', r => r.abort());
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('wt')) return; sessionStorage.setItem('wt', '1');
    localStorage.setItem('cn-cookie', 'declined');
    localStorage.setItem('cutnest-settings-v1', JSON.stringify({ kerf: 4, kerfTouched: true, companyName: 'Harper Fabrications Ltd',
      quote: { business: { address: 'Unit 7, Forge Road\nNewcastle NE6 2XX', phone: '0191 496 0000', email: 'sales@harperfab.co.uk', web: '', taxNo: '' } } }));
    localStorage.setItem('cutnest-licence-v1', JSON.stringify({ key: 'ABCD1234-EF56-7890-ABCD-1234567890AB', verified: true, lastCheck: new Date().toISOString() }));
  });
  const page = await ctx.newPage();
  await page.goto(base + '/app.html');
  await page.waitForFunction(() => isPro && library.length > 20);
  await page.evaluate(() => { mats = [{ id: 'mat-1', selectedMatId: 601, pieces: [{ w: '', h: '', qty: 1, label: '' }] }]; document.getElementById('job-ref').value = 'KIT-114'; renderAll(); });
  await page.addStyleTag({ content: `
    #cap{position:fixed;left:0;right:0;top:0;z-index:99999;background:rgba(10,58,71,.96);border-bottom:3px solid #f59e0b;color:#fff;
      font-family:"Barlow Condensed",sans-serif;font-weight:900;font-size:25px;line-height:1.1;padding:12px 16px 11px;display:flex;align-items:center;gap:10px;transition:opacity .3s}
    #cap b{background:#f59e0b;color:#0a3a47;border-radius:50%;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    #endcard{position:fixed;inset:0;z-index:100000;background:#0a3a47;color:#fff;display:none;flex-direction:column;justify-content:center;padding:36px;font-family:"Barlow Condensed",sans-serif}
    #endcard h1{font-size:56px;font-weight:900;line-height:1;margin-bottom:18px}#endcard h1 em{font-style:normal;color:#f59e0b}
    #endcard p{font-family:"Barlow",sans-serif;font-size:19px;color:rgba(255,255,255,.8);margin-bottom:28px;line-height:1.45}
    #endcard span{align-self:flex-start;background:#f59e0b;color:#0a3a47;font-size:40px;font-weight:900;padding:8px 22px;border-radius:12px}
    .toast{display:none!important}` });
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c);
    const e = document.createElement('div'); e.id = 'endcard';
    e.innerHTML = '<h1>Free to try.<br><em>No account.</em></h1><p>Sheet, bar &amp; tube. Cut sheets, labels and customer quotes with Pro.</p><span>cutnest.co.uk</span>';
    document.body.appendChild(e);
  });
  const caption = async (n, text) => page.evaluate(([n, t]) => { document.getElementById('cap').innerHTML = (n ? '<b>' + n + '</b>' : '') + t; }, [n, text]);
  const wait = ms => page.waitForTimeout(ms);
  const scrollTo = async (sel, offset) => page.evaluate(([s, o]) => {
    const el = document.querySelector(s); if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (o || 70), behavior: 'smooth' });
  }, [sel, offset]);

  // Record.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnwt-'));
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1080, maxHeight: 1350, everyNthFrame: 1 });

  await caption(1, 'Paste your cut list');
  await scrollTo('#block-mat-1', 60); await wait(900);
  await page.click('text=Paste list'); await wait(400);
  await page.evaluate(() => document.getElementById('paste-input').scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(500);
  await page.type('#paste-input', 'Door 715 x 497 x 6\nSide 720 x 560 x 6\nShelf 564 x 520 x 3\nBase 564 x 560 x 3\nRail 564 x 100 x 6', { delay: 38 });
  await wait(1100);
  await page.click('#paste-confirm'); await wait(900);
  await caption(2, 'Calculate: the fewest sheets');
  await wait(700);
  await page.click('#calc-btn');
  await page.waitForFunction(() => !_calcBusy && document.getElementById('output').style.display === 'block', null, { timeout: 30000 });
  await wait(300);
  await scrollTo('#order-line', 64); await wait(2600);
  await caption(3, 'Proved optimal, with the cost');
  await scrollTo('.pres-card', 64); await wait(2400);
  await caption(4, 'Every sheet drawn to scale');
  await scrollTo('#mat-visuals .sheet-vis', 64); await wait(2300);
  await scrollTo('#mat-visuals .sheet-vis:nth-of-type(3)', 64); await wait(1800);
  await caption(5, 'Then quote it (Pro)');
  await page.evaluate(() => scrollTo({ top: 0 })); await wait(200);
  await page.evaluate(() => openQuote()); await wait(900);
  await page.type('#q-customer', 'Tyne Joinery Ltd', { delay: 45 }); await wait(500);
  await page.evaluate(() => document.querySelector('#quote-modal .modal').scrollTo({ top: 700, behavior: 'smooth' })); await wait(1400);
  await page.click('text=+ Add a line'); await wait(300);
  await page.type('#q-extras .q-extra input >> nth=0', 'Delivery', { delay: 45 });
  await page.type('#q-extras .q-extra input >> nth=1', '35', { delay: 80 }); await wait(700);
  await page.evaluate(() => { const m = document.querySelector('#quote-modal .modal'); m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }); }); await wait(2600);
  await caption(0, 'Your quote, ready to send');
  await wait(1500);
  await page.evaluate(() => { document.getElementById('cap').style.opacity = 0; document.getElementById('endcard').style.display = 'flex'; });
  await wait(3200);
  await cdp.send('Page.stopScreencast');
  await wait(200);

  // Frame durations from the screencast timestamps; hold the last frame.
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const d = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].ts - f.ts) : 1.5;
    lines.push("file '" + f.file + "'", 'duration ' + d.toFixed(4));
  });
  lines.push("file '" + frames[frames.length - 1].file + "'");
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const file = path.join(OUT, 'video-app-walkthrough.mp4');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=0x0a3a47,fps=30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  // Cover frame for LinkedIn's custom thumbnail: step 3, proved optimal with the cost.
  spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '13', '-i', file, '-frames:v', '1', path.join(OUT, 'video-app-walkthrough-cover.png')], { stdio: 'inherit' });
  console.log('  ' + frames.length + ' frames, ' + (frames[frames.length - 1].ts - frames[0].ts).toFixed(1) + 's -> marketing/out/video-app-walkthrough.mp4',
    Math.round(fs.statSync(file).size / 1024) + 'KB');
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
