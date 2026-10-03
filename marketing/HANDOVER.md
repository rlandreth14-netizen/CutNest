# CutNest marketing: handover

Read this before doing any marketing work. It records what exists, what has been
done, and what is still open, as of 3 October 2026.

## The product

- **CutNest** (cutnest.co.uk): a cut list optimiser for sheet metal, timber,
  acrylic, bar and tube. It runs in the browser, needs no account, and keeps
  cut lists on the user's computer.
- **Free plan:** one material per job, nesting, cut sheets, bar and tube.
- **Pro:** £12/month **+ VAT** per company, and the whole team can share the
  key. It adds quotes, 5 materials per job, DXF, labels, grain lock, stock
  limits and the master library.
  - Always write the price as "£12/month + VAT". Lemon Squeezy adds VAT at
    checkout, so a UK customer pays £14.40.
- **Payments:** Lemon Squeezy (cutnest.lemonsqueezy.com, store 394602).
  - Licence keys follow the subscription.
  - The activation limit is 3 devices. Suggest raising it if a team hits it.
- **The owner** is a fabricator in Newcastle upon Tyne, which is a selling
  point.
- **Sales:** the first sale (Pro, monthly) came in on 2 Oct 2026.
  - Never name the customer or show their details.
  - Ask the owner before approaching them for a testimonial.

## Rules for copy

- **Voice:** British English, plain and direct, from a fabricator to other
  trades. No hype, no em-dash asides, no named competitors (their sites could
  not be checked).
- **Real numbers only.** The "one real job" story is the owner's own job:
  quoted 4 sheets of 316 brushed, it needed 3, £225 saved. Do not invent other
  customer stories.
- **Visuals come from the real engine and app.** Do not mock up results.
- **Brand:**
  - teal `#0a3a47` / `#0f4c5c`, amber `#f59e0b`;
  - fonts: Barlow Condensed 800–900 for headings, Barlow for body (in
    `/fonts`).

## Channels

| Channel | Where | Notes |
|---|---|---|
| Website | cutnest.co.uk (GitHub Pages, this repo) | Calculators, trade pages, guides; videos on 5 pages |
| LinkedIn | Owner's personal profile, plus linkedin.com/company/cutnest | Post from the personal profile; put the link in the first comment |
| YouTube | youtube.com/@cutnestuk (Brand Account under the owner's Gmail) | 3 videos live, listed below |
| Search Console | Domain property cutnest.co.uk | Sitemap submitted 3 Oct; indexing requested for new pages |
| Google Analytics | GA4, consent only | Links carry `utm_source` / `utm_medium` / `utm_campaign` |

YouTube videos (uploaded 3 Oct 2026):

| Video | ID | Length | On the site |
|---|---|---|---|
| Sheet Metal Cut List to Customer Quote, Step by Step | `WlbQUW9BZqM` | 1:17 | Home page |
| Cut Box Section From the Fewest Bars: Free Cutting Plan | `piMSd6Yh2vM` | 0:48 | Bar & tube page, bar calculator |
| How Many Sheets Do I Need? Free Plywood & MDF Calculator | `GLol4dvwyuo` | 0:49 | Plywood calculator, how-many-sheets guide |

Search Console before launch: 34 clicks in 4 months, almost all from people
searching "cutnest". Searches like "sheet metal nesting" and "plate nesting"
showed the site around position 70–90, which is why the free calculator pages
were built.

## What is in `marketing/`

All the output goes to `marketing/out/`, which git ignores. The commands are in
`README.md`.

- **`data.js`:** real engine layouts, written to `data.json`.
- **`cards.html` + `build.js`:** 8 LinkedIn images (1080×1350) and the
  carousel PDF "5 reasons you're over-ordering sheet material".
- **`video.html` + `video.js`:** the 30s animated overview (4:5, silent).
- **`walkthrough.js`:** a phone screen recording of the app (4:5, silent).
- **`posts.js` + `kit.js`:** 11 LinkedIn posts on a 6-week Tue/Thu schedule,
  written to `linkedin-posts.md` and `kit.html`.
- **`youtube.js`:** the three 1920×1080 YouTube walkthroughs.
  - They have a pointer, captions and chapters.
  - The voice-over is a British male (Kokoro voice `bm_george`), made by
    `tts.py`.
  - The narration text is `NARRATION` in `youtube.js`. Chapter times go to
    `youtube-<id>.json`.
  - It also renders the thumbnails, the channel banner and the profile
    picture from `thumbs.html`.
- **`youtube-kit.js`:** the channel set-up steps and upload text, written to
  `youtube-uploads.md` and `youtube-kit.html`.

Setting up a fresh machine:

- **ffmpeg:** `npm i ffmpeg-static` in a scratch folder, then point `FFMPEG=`
  at its binary.
- **Voice:** `pip install kokoro-onnx soundfile` (into a folder on
  `PYTHONPATH`), and put `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` in a
  folder named by `KOKORO_MODELS`. Both files come from
  github.com/thewh1teagle/kokoro-onnx/releases, tag `model-files-v1.0`.
  Hugging Face is blocked here, so use GitHub.
- **Run `node marketing/data.js` first.** `build.js` needs `data.json`.

The owner has private kit pages on claude.ai:

- LinkedIn kit: https://claude.ai/artifact/NnqLPCDSY2Gb3xn7Hba3sA
- YouTube kit: https://claude.ai/artifact/CFJnXnio1XiJDRXjET3kKv

## Done

- The LinkedIn kit is made, and the owner is posting from it. The narrated
  walkthrough is posted on LinkedIn too.
- The YouTube channel is set up and all 3 videos are uploaded.
- Prices show "+ VAT" everywhere: the site, the app, the terms, and the
  LinkedIn images and text.
- **Free calculators** (live), built in `tools/pages.py` on `js/demo.js`:
  - `/sheet-calculator.html`
  - `/plywood-cut-list-calculator.html`
  - `/bar-cutting-calculator.html`
- The YouTube link is in the site footer, and the organisation data lists
  LinkedIn and YouTube under `sameAs`.
- **Subtitles** for the 3 YouTube videos: `marketing/subtitles/*.srt`, timed
  against the uploaded files (each line within 0.1s). Upload them in YouTube
  Studio (Subtitles, English (UK), Upload file, With timing), and add them to
  LinkedIn video posts. New renders write their own `.srt` (`srt.js`).
- **Press release:** the owner turned it down (it reads as fake). Don't
  suggest it again.
- **Videos on the site** (PR #10, merged): they load YouTube only when someone
  presses play (youtube-nocookie). Each page also has VideoObject data, and
  the privacy policy has a YouTube line.

## Open, roughly in order of value

1. **Facebook groups** (UK welders, fabricators, joiners, sign makers): help
   people with genuine answers that link the free calculators. Read each
   group's rules first.
2. **Instagram Reels / TikTok** using the two vertical videos.
3. **A testimonial** from the first customer, added to the home page. The
   owner asks; we add it.
4. **Free directory listings:** AlternativeTo, SaaSHub, Capterra, G2. Also
   Bing Webmaster Tools, using "Import from Google Search Console".
5. **Supplier outreach:** steel stockholders, timber merchants and
   sign-material suppliers, asking them to link to the calculators.
6. **An email signature and LinkedIn banner line:** "Free cut list
   calculators: cutnest.co.uk".
7. **A small Google Ads test (£5/day)**, but only once Analytics shows how
   many visitors become paying customers.

## Working in this repo

- **Website pages** come from `tools/pages.py`. Edit that, run
  `python3 tools/pages.py`, and commit the HTML. CI fails if the HTML and the
  script disagree.
- **Tests:** `npm test` (engine) and `npm run test:ui` (browser). Run both
  before pushing any website change.
- **Service worker:** bump `VERSION` in `sw.js` when you change site CSS or JS.
- **App code** (`app.html`, `js/app.js`, `js/engine.js`) belongs to the code
  chat. Marketing work should not touch it unless the owner asks.
