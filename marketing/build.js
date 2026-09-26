// LinkedIn kit: renders marketing/cards.html to PNG images and a carousel PDF.
// Run: node marketing/build.js   (after node marketing/data.js)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(__dirname, '../node_modules/playwright'));
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
module.exports = { serve, ROOT, OUT };

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const singles = ['launch', 'story', 'areamyth', 'kerf', 'bars', 'quote', 'optimal', 'free'];
  for (const [i, id] of singles.entries()) {
    await page.goto(base + '/marketing/cards.html?c=' + id);
    await page.waitForSelector('body[data-ready]');
    const file = path.join(OUT, 'post-' + String(i + 1).padStart(2, '0') + '-' + id + '.png');
    await (await page.$('.card')).screenshot({ path: file });
    console.log('  ' + path.relative(ROOT, file));
  }
  // Carousel: one PDF page per slide (LinkedIn "document" post), plus the cover as PNG.
  const slides = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
  await page.goto(base + '/marketing/cards.html?c=' + slides.join(','));
  await page.waitForSelector('body[data-ready]');
  await page.addStyleTag({ content: '@page{size:1080px 1350px;margin:0} body{background:none} .card{page-break-after:always;break-after:page}' });
  await page.pdf({ path: path.join(OUT, 'carousel-5-reasons.pdf'), width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });
  console.log('  marketing/out/carousel-5-reasons.pdf');
  await (await page.$('.card')).screenshot({ path: path.join(OUT, 'carousel-cover.png') });
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
