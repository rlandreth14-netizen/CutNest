// Renders marketing/video.html frame by frame and encodes an H.264 MP4.
// Run: FFMPEG=/path/to/ffmpeg node marketing/video.js
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require(path.join(__dirname, '../node_modules/playwright'));
const { serve, OUT } = require('./build.js');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(base + '/marketing/video.html');
  await page.waitForSelector('body[data-ready]');
  const T = await page.evaluate(() => window.DURATION);
  const file = path.join(OUT, 'video-30s-overview.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(T * FPS);
  for (let f = 0; f <= frames; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f === Math.round(15.2 * FPS)) fs.writeFileSync(path.join(OUT, 'video-30s-overview-cover.png'), png);
    if (f % 150 === 0) process.stdout.write('  frame ' + f + '/' + frames + '\n');
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('  ' + path.relative(path.join(__dirname, '..'), file), Math.round(fs.statSync(file).size / 1024) + 'KB');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
