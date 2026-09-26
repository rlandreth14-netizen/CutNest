#!/usr/bin/env python3
"""Writes the website's content pages (trades, guides, buyer's checklist) and
keeps the shared nav, footer and cookie banner identical on every page,
including index.html (between the SITE:NAV / SITE:FOOTER markers).

The site stays plain static HTML: this script only saves typing the same
header and footer eight times. Run it after changing a page or the shared
parts, then commit the HTML it writes:

    python3 tools/pages.py
"""
import html, json, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = 'https://cutnest.co.uk'
UPDATED = '2026-09-26'
CHECKOUT = 'https://cutnest.lemonsqueezy.com/checkout/buy/a9fdfebb-ea08-4962-8aae-45e608f0cc6e'

LOGO = '''<svg class="brand-logo" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="8" fill="#0f4c5c"/>
      <rect x="4" y="4" width="13" height="9" rx="2" fill="#f59e0b"/>
      <rect x="19" y="4" width="13" height="15" rx="2" fill="white" opacity=".9"/>
      <rect x="4" y="15" width="13" height="17" rx="2" fill="white" opacity=".9"/>
      <rect x="19" y="21" width="13" height="11" rx="2" fill="#f59e0b" opacity=".8"/>
    </svg>'''

NAV = f'''<!-- SITE:NAV (written by tools/pages.py) -->
<nav class="nav">
  <a class="brand" href="/">
    {LOGO}
    <div class="brand-name">Cut<span>Nest</span></div>
  </a>
  <div class="nav-links">
    <a href="/#demo" class="nav-link">Live demo</a>
    <a href="/#features" class="nav-link">Features</a>
    <a href="/guides.html" class="nav-link">Guides</a>
    <a href="/#pricing" class="nav-link">Pricing</a>
    <a href="/app.html" class="btn-try" data-placement="nav">Try it free &rarr;</a>
  </div>
  <button class="nav-hamburger" id="nav-hamburger" onclick="openNav()" aria-label="Open menu" aria-expanded="false" aria-controls="nav-mobile">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="nav-mobile" id="nav-mobile" role="dialog" aria-modal="true" aria-label="Menu">
  <button class="nav-mobile-close" onclick="closeNav()" aria-label="Close menu">&times;</button>
  <a href="/#demo" onclick="closeNav()">Live demo</a>
  <a href="/#features" onclick="closeNav()">Features</a>
  <a href="/guides.html" onclick="closeNav()">Guides</a>
  <a href="/#pricing" onclick="closeNav()">Pricing</a>
  <a href="/app.html" data-placement="nav-mobile" style="background:var(--amber);color:var(--teal2);padding:14px 36px;border-radius:9px;font-weight:900;font-size:20px;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px">Try Free &rarr;</a>
</div>
<!-- /SITE:NAV -->'''

FOOTER = f'''<!-- SITE:FOOTER (written by tools/pages.py) -->
<div class="mobile-cta-bar" id="mobile-cta">
  <a href="/app.html" class="mcta-free" data-placement="mobile-bar">Try Free &rarr;</a>
  <a href="{CHECKOUT}" target="_blank" rel="noopener" class="mcta-pro" data-placement="mobile-bar">Pro &pound;12/mo</a>
</div>
<footer>
  <div class="footer-inner">
    <div class="footer-top">
      <div>
        <div class="footer-brand-name">Cut<span>Nest</span></div>
        <div class="footer-brand-desc">Cut list optimisation for sheet, bar and tube. Built by a fabricator in Newcastle upon Tyne. Used by fabricators, joiners and trades across the UK.</div>
        <div style="margin-top:14px;display:flex;gap:10px">
          <a href="https://www.linkedin.com/company/cutnest" target="_blank" rel="noopener" class="footer-social">LinkedIn</a>
        </div>
      </div>
      <div class="footer-links-group">
        <h4>Product</h4>
        <a href="/app.html">Open the app</a>
        <a href="/#demo">Live demo</a>
        <a href="/#features">Features</a>
        <a href="/#pricing">Pricing</a>
      </div>
      <div class="footer-links-group">
        <h4>Trades</h4>
        <a href="/sheet-metal.html">Sheet metal</a>
        <a href="/joinery.html">Joinery &amp; cabinets</a>
        <a href="/signs-and-plastics.html">Signs &amp; plastics</a>
        <a href="/bar-and-tube.html">Bar &amp; tube</a>
      </div>
      <div class="footer-links-group">
        <h4>Guides</h4>
        <a href="/guides/how-many-sheets.html">How many sheets?</a>
        <a href="/guides/saw-kerf.html">Kerf guide</a>
        <a href="/choosing-a-cut-list-optimiser.html">Choosing an optimiser</a>
        <a href="/guides.html">All guides</a>
      </div>
      <div class="footer-links-group">
        <h4>Company</h4>
        <a href="mailto:hello@cutnest.co.uk">hello@cutnest.co.uk</a>
        <a href="/terms.html">Terms of Service</a>
        <a href="/privacy.html">Privacy Policy</a>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="footer-copy">&copy; 2025&ndash;2026 CutNest &middot; cutnest.co.uk</div>
      <div class="footer-made">Made in <span>Newcastle upon Tyne, UK</span></div>
    </div>
  </div>
</footer>
<div class="cookie" id="cookie">
  <span>CutNest saves your settings in your browser&rsquo;s local storage (always &mdash; it&rsquo;s how the app works offline). We&rsquo;d also like to use Google Analytics for anonymised usage stats. No ads, no cross-site tracking. See our <a href="/privacy.html">Privacy Policy</a>.</span>
  <span style="display:flex;gap:8px;flex-shrink:0">
    <button class="btn-cookie" style="background:none;border:1px solid rgba(255,255,255,.35);color:rgba(255,255,255,.85)" onclick="declineCookie()">Decline analytics</button>
    <button class="btn-cookie" onclick="acceptCookie()">Accept</button>
  </span>
</div>
<!-- /SITE:FOOTER -->'''


def head(title, desc, path, ld):
    url = SITE + path
    lds = ''.join('<script type="application/ld+json">\n' + json.dumps(x, ensure_ascii=False, indent=1) + '\n</script>\n' for x in ld)
    return f'''<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}"/>
<link rel="canonical" href="{url}"/>
<meta name="robots" content="index,follow"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="CutNest"/>
<meta property="og:title" content="{html.escape(title)}"/>
<meta property="og:description" content="{html.escape(desc)}"/>
<meta property="og:url" content="{url}"/>
<meta property="og:image" content="{SITE}/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="{SITE}/og-image.png"/>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230f4c5c'/><rect x='4' y='4' width='11' height='8' rx='1' fill='%23f59e0b'/><rect x='17' y='4' width='11' height='13' rx='1' fill='white' opacity='.9'/><rect x='4' y='14' width='11' height='14' rx='1' fill='white' opacity='.9'/><rect x='17' y='19' width='11' height='9' rx='1' fill='%23f59e0b' opacity='.8'/></svg>"/>
<link rel="manifest" href="/manifest.webmanifest"/>
<meta name="theme-color" content="#0a3a47"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<link rel="preload" href="/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin/>
<link rel="preload" href="/fonts/barlow-condensed-800.woff2" as="font" type="font/woff2" crossorigin/>
<link rel="stylesheet" href="/fonts/fonts.css"/>
<link rel="stylesheet" href="/css/site.css"/>
<script src="/js/site.js"></script>
{lds}</head>
<body>
'''


def crumbs(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate(items)]}


def faq_ld(faqs):
    strip = lambda x: html.unescape(re.sub(r'<[^>]+>', '', x)).strip()
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": strip(q), "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in faqs]}


def faq_html(faqs):
    return '<section class="faq pg-faq"><div class="sec-eyebrow">Questions</div><h2 class="sec-h2" style="margin-bottom:18px">Straight answers</h2>' + ''.join(
        f'<div class="faq-item"><button type="button" class="faq-q" aria-expanded="false">{q}</button><div class="faq-a">{a}</div></div>' for q, a in faqs) + '</section>'


def cta(title='Try it on your own job', sub='Free, in your browser, no account. Your cut list stays on your computer.'):
    return f'''<section class="cta-band">
  <h2>{title}</h2>
  <p>{sub}</p>
  <div class="cta-btns"><a href="/app.html" class="btn-primary" data-placement="cta-band">Open CutNest free &rarr;</a>
  <a href="/#pricing" class="btn-secondary">See Pro &mdash; &pound;12/month</a></div>
</section>'''


def page(path, title, desc, h1, lead, body, faqs=None, ld=None, crumb=None, demo=False, eyebrow=''):
    ld = list(ld or [])
    if crumb:
        ld.append(crumbs(crumb))
    if faqs:
        ld.append(faq_ld(faqs))
    out = head(title, desc, path, ld) + NAV + f'''
<main>
<header class="pg-hero">
  <div class="pg-hero-inner">
    {f'<div class="sec-eyebrow pg-eyebrow">{eyebrow}</div>' if eyebrow else ''}
    <h1>{h1}</h1>
    <p class="pg-lead">{lead}</p>
  </div>
</header>
{body}
{faq_html(faqs) if faqs else ''}
{cta()}
</main>
''' + FOOTER + ('\n<script src="/js/demo.js" defer></script>' if demo else '') + '\n</body>\n</html>\n'
    fp = os.path.join(ROOT, path.lstrip('/'))
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, 'w') as f:
        f.write(out)
    return path


def demo_block(preset, title, sub, extra=''):
    return f'''<section class="pg-demo">
  <div class="pg-demo-inner">
    <h2>{title}</h2>
    <p>{sub}</p>
    <div class="cn-demo" data-preset="{preset}" data-only {extra}><noscript><p>The live demo needs JavaScript. <a href="/app.html">Open the app</a> instead.</p></noscript></div>
  </div>
</section>'''


def points(items):
    return '<div class="pg-points">' + ''.join(f'<div class="pg-point"><h3>{h}</h3><p>{p}</p></div>' for h, p in items) + '</div>'


def section(h2, inner, cls=''):
    return f'<section class="pg-sec {cls}"><div class="pg-sec-inner"><h2 class="sec-h2">{h2}</h2>{inner}</div></section>'


def software_ld(desc):
    return {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "CutNest", "url": SITE,
            "applicationCategory": "BusinessApplication", "operatingSystem": "Web", "description": desc,
            "offers": [{"@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "GBP"},
                       {"@type": "Offer", "name": "Pro Monthly", "price": "12.00", "priceCurrency": "GBP"}]}


def article_ld(path, headline, desc):
    return {"@context": "https://schema.org", "@type": "Article", "headline": headline, "description": desc,
            "mainEntityOfPage": SITE + path, "dateModified": UPDATED, "datePublished": UPDATED,
            "author": {"@type": "Organization", "name": "CutNest", "url": SITE},
            "publisher": {"@type": "Organization", "name": "CutNest", "url": SITE}}


PAGES = []

# ── TRADES ────────────────────────────────────────────────────────
PAGES.append(page(
    '/sheet-metal.html',
    'Sheet Metal Nesting & Cut Lists for Fabricators | CutNest',
    'Nest parts on steel, stainless, aluminium and galv sheet before you order. Real sheet counts, your prices, grain lock for brushed finishes, DXF for the laser, and a customer quote from the layout.',
    'Know the sheet count <span>before the steel arrives</span>',
    'CutNest nests your parts on the sheet sizes you actually buy, tells you exactly what to order, and prices the job &mdash; in the browser, in seconds, without touching your CAM.',
    demo_block('metal', 'Nest a real sheet-metal job', 'Covers, brackets, base plates and gussets on 2450&times;1150 and 2050&times;900 mild steel. Change any part and calculate.') +
    section('Built for how a fab shop quotes', points([
        ('Your sheet sizes, your prices', 'Enter 2500&times;1250, 3000&times;1500 or whatever your stockholder sends, with the price per sheet. CutNest picks the cheapest mix and can be told you only have six of a size.'),
        ('Brushed and polished finishes (Pro)', 'Lock the grain on brushed stainless or on individual parts, so a door face never ends up running the wrong way on the nest.'),
        ('Laser, plasma, punch or guillotine', 'Set the gap between parts to suit the machine (a few millimetres on a laser, more on plasma or a punch), or switch a material to guillotine for shear work with a numbered cut sequence.'),
        ('DXF straight to CAM (Pro)', 'Export the nest as a DXF with every part on its own layer. CutNest sits at the quoting stage; your programmer keeps using the nesting software they already run.'),
        ('Quote from the layout (Pro)', 'Cut length and pierces come from the actual nest, at your machine rate, plus handling, markup and VAT &mdash; printed as a quote with your logo.'),
        ('Offcuts that come back (Pro)', 'Usable offcuts are measured on every sheet. Save them to stock and CutNest offers them back on the next job in that material before you buy another sheet.'),
    ])),
    faqs=[
        ('Does CutNest replace my nesting software?', 'No. CutNest is for the office: knowing how many sheets to order and what the job will cost, before production. Your programmer keeps using their nesting and NC software for the machine; CutNest&rsquo;s DXF can help them start from the same layout.'),
        ('What gap should I leave between parts on a laser?', 'The beam itself removes well under a millimetre, but most shops leave a few millimetres between parts for heat and a stable skeleton. Use the gap you actually leave. The <a href="/guides/saw-kerf.html">kerf guide</a> has typical figures for laser, plasma, punch and saw.'),
        ('Can it handle brushed stainless where the grain matters?', 'Yes, with Pro. Lock the grain on the material (every part keeps its orientation) or on individual parts, so hidden parts can still turn to fill gaps.'),
        ('Does it work for bar and box section too?', 'Yes. Add the section as a bar material with your stock lengths and CutNest cuts parts to length, in the same job as the sheet with Pro. See <a href="/bar-and-tube.html">bar and tube</a>.'),
    ],
    ld=[software_ld('Sheet metal nesting and cut list optimisation for fabricators.')],
    crumb=[('Home', '/'), ('Sheet metal', '/sheet-metal.html')], demo=True, eyebrow='For sheet metal fabricators'))

PAGES.append(page(
    '/joinery.html',
    'Cut List Optimiser for Joiners & Cabinet Makers | CutNest',
    'Panel saw cut lists for MDF, ply and melamine: the fewest boards, a numbered saw sequence, grain per part, labels for every piece and a customer quote. Free to try, in your browser.',
    'Fewer boards, and a saw list <span>the shop can follow</span>',
    'Type or paste your cut list, choose the board, and CutNest works out the fewest sheets with cuts that run edge to edge, the way a panel saw works.',
    demo_block('kitchen', 'Cut a set of kitchen carcasses', 'Sides, bases, shelves and rails from 2440&times;1220 MDF, laid out for a panel saw. Change the sizes to your own units.') +
    section('Made for the panel saw and the bench', points([
        ('Guillotine cuts, in order (Pro)', 'Every layout can be cut with edge-to-edge saw cuts, and the cut sheet numbers them in order with where to measure from &mdash; rips and crosscuts included.'),
        ('Grain where it shows (Pro)', 'Lock the grain on veneered or woodgrain board, per material or per part: doors and drawer fronts stay with the grain, hidden backs and shelves turn to save board.'),
        ('Paste your cut list', 'Paste from an email or spreadsheet, or open a CSV or Excel file. &ldquo;Door 715 x 497 x 6&rdquo; is enough; a header row with Length, Width and Qty is read by column.'),
        ('Labels for every part (Pro)', 'Print a label for each part on standard Avery sheets with the job, part name, size and the same number as the cut sheet, so nothing gets mixed up.'),
        ('Offcuts worth keeping', 'Each sheet shows its largest usable offcut. With Pro, save it and CutNest uses it first on the next job in that board.'),
        ('Price the job (Pro)', 'Boards with your markup, saw time from the actual cut sequence, handling and VAT, on a quote with your name on it.'),
    ])),
    faqs=[
        ('Will the cutting plan work on my panel saw?', 'Yes: set the board&rsquo;s cutting method to guillotine (Pro) and every layout is made of cuts that run right across the piece you are holding, with a numbered sequence on the cut sheet. Free placement is for CNC routers.'),
        ('What blade kerf should I use?', 'The width of your saw blade, typically around 3&ndash;4.5mm for a panel or table saw and a little less for a track saw. The <a href="/guides/saw-kerf.html">kerf guide</a> shows why a single millimetre can cost a whole part per row.'),
        ('Can I use my own board sizes and prices?', 'Yes. Add the boards you buy (2440&times;1220, 3050&times;1220, half sheets) with prices; CutNest picks the cheapest mix. The free plan uses 2 sizes per board, Pro up to 12.'),
        ('Does it work in inches?', 'Yes. Choose inches in Settings and type 23 5/8 or 8&prime; 6; every layout, cut sheet and export comes out in inches.'),
    ],
    ld=[software_ld('Cut list optimiser for joiners, cabinet makers and kitchen fitters.')],
    crumb=[('Home', '/'), ('Joinery & cabinets', '/joinery.html')], demo=True, eyebrow='For joiners &amp; cabinet makers'))

PAGES.append(page(
    '/signs-and-plastics.html',
    'Cut Lists for Acrylic, Dibond & Sign Board | CutNest',
    'Nest sign panels, plaques and fabrication parts on acrylic, polycarbonate, Foamex and composite sheet. Fewer sheets, costed jobs and a quote your customer can sign off.',
    'Get more signs <span>out of every sheet</span>',
    'Acrylic and composite sheet is expensive. CutNest nests panels and small parts together on your sheet sizes so you buy fewer sheets, and prices the job while you are at it.',
    demo_block('signs', 'Nest a sign job on 3mm acrylic', 'A panel, plaques and trays on a full and a half sheet. Change the sizes to your own job.') +
    section('For sign makers and plastic fabricators', points([
        ('Full and half sheets', 'Give CutNest the sheet sizes you stock with their prices and it chooses the cheapest combination, including half sheets when the job does not need a full one.'),
        ('Router or laser', 'Free placement for CNC router and laser work, with the gap you leave between parts (a cutter&rsquo;s diameter on a router).'),
        ('Mixed materials, one job (Pro)', 'Acrylic faces, composite backs and aluminium box section for the frame, nested and costed together.'),
        ('Directional finishes (Pro)', 'Brushed or patterned sheet can be grain-locked so every part keeps the same direction.'),
        ('Quotes in a minute (Pro)', 'Material with markup, machine time from the layout, installation or delivery as extra lines, VAT, and your logo on the quote.'),
        ('Offcut stock (Pro)', 'Keep the usable offcuts from each job and use them before the next full sheet.'),
    ])),
    faqs=[
        ('What gap should I leave for a router?', 'At least the cutter diameter (for example 6mm), plus anything you leave for tabs. Set it as the kerf and CutNest keeps that gap between every pair of parts.'),
        ('Can I quote the job as well?', 'With Pro, yes: the Quote button prices material, machine time from the layout, handling, extras and VAT, and prints a quote with your business details and logo.'),
        ('Does the free plan work for signs?', 'Yes. The free plan nests one material per job on two sheet sizes; Pro adds more materials per job, more sizes, stock limits and quotes.'),
    ],
    ld=[software_ld('Cut list and nesting for sign makers and plastic fabricators.')],
    crumb=[('Home', '/'), ('Signs & plastics', '/signs-and-plastics.html')], demo=True, eyebrow='For sign makers &amp; plastics'))

PAGES.append(page(
    '/bar-and-tube.html',
    'Bar, Tube & Extrusion Cutting Optimiser | CutNest',
    'Cut box section, angle, flat bar, aluminium extrusion and timber to length from your stock lengths: the fewest bars, a saw list per pattern and the offcuts worth keeping. Free, in your browser.',
    'Cut to length from <span>the fewest bars</span>',
    'Tell CutNest the lengths you buy and the lengths you need. It works out the fewest bars (or the cheapest mix of lengths), groups the bars cut the same way and prints a saw list.',
    demo_block('bar', 'Cut a frame from box section', 'Top rails, legs and braces from 7.5m and 6m lengths of 40&times;40&times;3 SHS with a 2mm saw kerf.') +
    section('For the saw, not just the spreadsheet', points([
        ('Your stock lengths and prices', '6m, 6.5m, 7.5m or random lengths you have in the rack &mdash; with prices and how many you have. CutNest picks the cheapest mix.'),
        ('One saw list per pattern', 'Bars cut the same way are grouped: &ldquo;cut 4 bars like this&rdquo;, with the stop length for each cut and the marks from the bar end.'),
        ('End trim and saw kerf', 'Square up damaged ends with an end trim, and give each section its own saw kerf (a bandsaw is not the same as the laser in Settings).'),
        ('Offcuts marked', 'The offcut at the end of each bar is measured, and the ones worth keeping are marked on the plan and the saw list.'),
        ('Provably optimal', 'Every plan is checked against a mathematical lower bound. When CutNest hits it, no plan can use fewer bars and it says so.'),
        ('Sheet and bar together (Pro)', 'Put the plate and the box section in one job and one quote, with saw time for the bars and machine time for the sheet.'),
    ])),
    faqs=[
        ('What is the best way to cut bars to length with the least waste?', 'It is the one-dimensional cutting stock problem. CutNest runs two different methods on every job (a sheet-nesting search and a &ldquo;fullest bar first&rdquo; heuristic) and keeps the better plan, then checks it against a lower bound.'),
        ('Can I enter lengths in metres or feet?', 'Yes: 2.4m, 2400, 94 1/2&Prime; and 8&prime; 6 are all read. Choose inches in Settings to work in feet and inches throughout.'),
        ('Is bar cutting a Pro feature?', 'No, it works on every plan. Pro adds several materials per job (sheet and bar together), more stock lengths, stock limits and quotes.'),
    ],
    ld=[software_ld('Linear cutting optimiser for bar, tube, angle, extrusion and timber lengths.')],
    crumb=[('Home', '/'), ('Bar & tube', '/bar-and-tube.html')], demo=True, eyebrow='For bar, tube &amp; extrusion'))

# ── GUIDES ────────────────────────────────────────────────────────
PAGES.append(page(
    '/guides/how-many-sheets.html',
    'How Many Sheets Do I Need? Plywood, MDF & Steel Calculator | CutNest',
    'Why dividing total part area by sheet area under-orders, what to allow for kerf and grain, and a free calculator that nests your parts to give the real sheet count.',
    'How many sheets do I need?',
    'The quick answer &mdash; add up the area of the parts and divide by the area of a sheet &mdash; is usually wrong, and always in the direction that costs you a second delivery. Here is why, and a calculator that does it properly.',
    demo_block('custom', 'Calculator: your sheet, your parts', 'Enter your sheet size, kerf and parts. CutNest nests them for real and shows what the area sum would have said.', 'data-compare') +
    section('Why the area sum under-orders', '''<div class="prose">
<p>Area arithmetic assumes parts can be poured into a sheet like water. They can&rsquo;t. Three things break it:</p>
<ol>
<li><b>Parts don&rsquo;t tessellate.</b> Two 1400&times;700 desk tops on a 2440&times;1220 sheet need 1404mm of width side by side and only 1220mm is there, so each top uses most of a sheet on its own. In the calculator above, a small desk job has an area sum of 2 sheets and really needs 3.</li>
<li><b>Every cut removes material.</b> The saw blade or cutter takes its width out of every cut. On a row of parts that is a few millimetres each time, and a few millimetres is sometimes the difference between four parts in a row and three. The <a href="/guides/saw-kerf.html">kerf guide</a> has a worked example.</li>
<li><b>Grain and finish limit rotation.</b> Veneered board, woodgrain melamine and brushed stainless can&rsquo;t be turned 90&deg; to fill a gap, so fewer arrangements are possible.</li>
</ol>
<p>A &ldquo;10% for waste&rdquo; allowance is a guess on top of a guess: too little on a job of big parts, too much on a job of small ones.</p>
</div>''') +
    section('The reliable way', '''<div class="prose">
<ol>
<li>List every part with its finished size and quantity, and note which ones must keep the grain direction.</li>
<li>Use the sheet sizes you can actually buy, and the kerf of the tool that will cut them.</li>
<li>Nest the parts &mdash; by hand on paper for a few, or with a cut list optimiser for anything more.</li>
<li>Count the sheets, then check the leftover: a big offcut is stock for the next job, not waste.</li>
</ol>
<p>That is what the calculator above does with CutNest&rsquo;s engine. The <a href="/app.html">full app</a> adds several sheet sizes with prices (it picks the cheapest mix), grain per part, cut sheets for the saw, and a quote.</p>
</div>'''),
    faqs=[
        ('How many sheets of plywood do I need for a job?', 'Nest the parts on the sheet size you can buy, with your saw&rsquo;s kerf, and count the sheets. Dividing total area by sheet area gives a minimum, not an answer: on jobs with large parts it can be a whole sheet short.'),
        ('How much should I add for waste?', 'Rather than a percentage, nest the job: the waste is whatever the real layout leaves. For rough budgeting, jobs of large panels waste more than jobs of small parts.'),
        ('What size is a standard sheet?', 'In the UK most board is 2440&times;1220mm (8&times;4 ft), with 3050&times;1220mm also common; sheet steel is commonly 2500&times;1250 or 2000&times;1000mm, with other sizes from stockholders. Use the sizes your supplier actually sells.'),
    ],
    ld=[article_ld('/guides/how-many-sheets.html', 'How many sheets do I need?', 'Why the area sum under-orders, and a calculator that nests your parts.')],
    crumb=[('Home', '/'), ('Guides', '/guides.html'), ('How many sheets do I need?', '/guides/how-many-sheets.html')], demo=True, eyebrow='Guide'))

PAGES.append(page(
    '/guides/saw-kerf.html',
    'Saw Kerf Guide: Typical Kerf Widths and Why They Matter | CutNest',
    'Typical kerf and part spacing for panel saws, track saws, bandsaws, CNC routers, laser, plasma, waterjet and punch, with a worked example of how one millimetre of kerf can cost a part per row.',
    'Kerf: the millimetres that <span>cost you parts</span>',
    'Kerf is the width of material a cut removes. In a cut list it is the gap you must leave between parts, and it adds up faster than most people expect.',
    section('One millimetre, one part per row', '''<div class="prose">
<p>Take 606&times;300mm parts on a 2440&times;1220mm sheet. Across the 2440mm width, four parts need 4 &times; 606 = 2424mm plus three cuts between them:</p>
<table class="pg-tbl"><thead><tr><th>Kerf</th><th>Four across</th><th>Fits in 2440mm?</th><th>Parts per sheet</th></tr></thead><tbody>
<tr><td>5mm</td><td>2424 + 3 &times; 5 = 2439mm</td><td>Yes, 1mm spare</td><td><b>16</b> (4 across &times; 4 down)</td></tr>
<tr><td>6mm</td><td>2424 + 3 &times; 6 = 2442mm</td><td>No, 2mm over</td><td><b>12</b> (3 across &times; 4 down)</td></tr>
</tbody></table>
<p>One extra millimetre of kerf loses a quarter of the sheet: 16 parts on one sheet becomes two sheets. That is why CutNest asks for your kerf before anything else, and why it keeps the exact figure (a 1/8&Prime; blade stays 3.175mm, not &ldquo;about 3&rdquo;).</p>
</div>''') +
    section('Typical kerf and spacing by process', '''<div class="prose">
<p>These are typical figures to start from, not specifications. Measure your own blade or cutter, or ask whoever programs the machine what gap they leave between parts, and use that.</p>
<table class="pg-tbl"><thead><tr><th>Process</th><th>Typical gap to use</th><th>Notes</th></tr></thead><tbody>
<tr><td>Panel saw / table saw</td><td>about 3&ndash;4.5mm</td><td>The blade&rsquo;s tooth width. Scoring blades don&rsquo;t add to it.</td></tr>
<tr><td>Track / plunge saw</td><td>about 2&ndash;3mm</td><td>Thinner blades; check the blade&rsquo;s stated kerf.</td></tr>
<tr><td>Mitre saw (timber lengths)</td><td>about 2.5&ndash;3.5mm</td><td>Use as the saw kerf on a bar material.</td></tr>
<tr><td>Metal bandsaw</td><td>about 1.5&ndash;2mm</td><td>Common for box section and bar.</td></tr>
<tr><td>Cold saw</td><td>about 2&ndash;3mm</td><td></td></tr>
<tr><td>CNC router</td><td>the cutter diameter, e.g. 6mm</td><td>Add any extra you leave for tabs or onion skin.</td></tr>
<tr><td>Fibre / CO&#8322; laser</td><td>a few mm between parts</td><td>The cut itself is well under 1mm; shops leave a gap for heat and a stable skeleton.</td></tr>
<tr><td>Plasma</td><td>about 5mm or more</td><td>Wider cut and more heat than a laser.</td></tr>
<tr><td>Waterjet</td><td>about 1&ndash;2mm plus spacing</td><td></td></tr>
<tr><td>Turret punch</td><td>often 15&ndash;20mm</td><td>Clamp zones and tooling need space; ask your programmer.</td></tr>
<tr><td>Guillotine shear</td><td>0mm</td><td>A shear removes no material.</td></tr>
</tbody></table>
<p>In CutNest the kerf is set once in Settings, and a bar material can have its own saw kerf, so the bandsaw for box section and the laser for plate can live in the same job.</p>
</div>'''),
    faqs=[
        ('What is kerf?', 'The width of material removed by a cut: the saw blade&rsquo;s tooth width, the router cutter&rsquo;s diameter, or the width of a laser or plasma cut. In a cut list it is the minimum gap between two parts.'),
        ('Does kerf apply at the edge of the sheet?', 'Not between a part and the sheet edge. It applies between parts. Damaged or out-of-square edges are a separate allowance, which CutNest calls edge trim.'),
        ('What kerf should I use for a laser?', 'The gap you actually leave between parts on the nest, which is normally more than the beam&rsquo;s own cut. A few millimetres is common; use your own figure.'),
    ],
    ld=[article_ld('/guides/saw-kerf.html', 'Kerf: the millimetres that cost you parts', 'Typical kerf and part spacing by process, with a worked example.')],
    crumb=[('Home', '/'), ('Guides', '/guides.html'), ('Kerf guide', '/guides/saw-kerf.html')], eyebrow='Guide'))

PAGES.append(page(
    '/choosing-a-cut-list-optimiser.html',
    'Choosing a Cut List Optimiser: 12 Questions to Ask | CutNest',
    'A practical checklist for choosing cut list or nesting software for a workshop: the questions that decide whether it saves material and time, and how CutNest answers each one.',
    'Choosing a cut list optimiser: <span>12 questions to ask</span>',
    'Most tools can pack rectangles onto a sheet. What separates them is whether the result fits how your shop buys, cuts and quotes. Ask these of any tool you try &mdash; including this one.',
    section('The checklist', '<div class="pg-check">' + ''.join(
        f'<div class="pg-q"><div class="pg-qn">{i + 1}</div><div><h3>{q}</h3><p class="pg-why">{why}</p><p class="pg-ans"><b>CutNest:</b> {a}</p></div></div>'
        for i, (q, why, a) in enumerate([
            ('Does it use the sheet sizes and prices you actually buy?', 'A tool that only knows one sheet size can&rsquo;t tell you that two half sheets are cheaper than a full one.', 'Up to 12 sizes per material with prices and &ldquo;I have 6 of these&rdquo; stock limits (2 sizes on the free plan); it picks the cheapest mix.'),
            ('Does it tell you when a layout is as good as it gets?', 'Without a bound you never know if a better nest exists.', 'Every result is checked against a mathematical lower bound and marked provably optimal when it hits it.'),
            ('Can it cut for a saw, not just a CNC?', 'A nest a panel saw can&rsquo;t cut is no use to a joiner.', 'Guillotine mode with a numbered, edge-to-edge cut sequence on the cut sheet (Pro); free placement for CNC.'),
            ('Does it respect grain, per part?', 'Veneered and brushed faces must not rotate; hidden parts should.', 'Grain lock per material, and per part (Pro).'),
            ('Does it handle bar, tube and extrusion?', 'Most jobs have some section in them.', 'Yes, on every plan: stock lengths, end trim, saw kerf per section, and a saw list per pattern.'),
            ('Can it get your cut list in without retyping?', 'Retyping 60 parts is where mistakes come from.', 'Paste from email or a spreadsheet, or open CSV and Excel files; header rows are read by column.'),
            ('Does it keep usable offcuts?', 'The cheapest sheet is the one already on the rack.', 'Usable offcuts are measured and can be saved to stock and offered back on the next job (Pro).'),
            ('What do you hand the workshop?', 'The office&rsquo;s answer has to reach the machine intact.', 'Dimensioned cut sheets, saw lists, labels for every part (Pro), CSV, PDF and DXF (Pro).'),
            ('Can it price the job?', 'The sheet count is only half a quote.', 'Pro turns the layout into a quote: material with markup, machine time from the actual cuts, handling, extras, VAT and your logo.'),
            ('Where does your data live?', 'Cut lists and prices are commercial information.', 'In your browser. No account; nothing is uploaded; the app works offline once loaded.'),
            ('Millimetres or inches?', 'Your supplier and your tape measure should agree with the software.', 'Both, with fractions (23 5/8, 8&prime; 6) and metres (2.4m).'),
            ('What does it cost for the whole team?', 'Per-seat pricing adds up in a busy shop.', 'Free for one material per job; Pro is &pound;12 a month per company and the key can be shared with your team.'),
        ])) + '</div>') +
    section('Try it before you decide', '<div class="prose"><p>The quickest test is your own last job. Enter it in the <a href="/#demo">live demo</a> or the <a href="/app.html">app</a> and compare the sheet count with what you ordered.</p></div>'),
    ld=[article_ld('/choosing-a-cut-list-optimiser.html', 'Choosing a cut list optimiser: 12 questions to ask', 'A practical checklist for choosing cut list software for a workshop.')],
    crumb=[('Home', '/'), ('Choosing a cut list optimiser', '/choosing-a-cut-list-optimiser.html')], eyebrow='Buyer&rsquo;s checklist'))

PAGES.append(page(
    '/guides.html',
    'Guides for Fabricators, Joiners and Sign Makers | CutNest',
    'Practical guides on ordering sheet material, kerf and cut list software, from a fabricator in Newcastle upon Tyne.',
    'Guides',
    'Short, practical guides on getting more out of sheet and bar, from someone who orders it for a living.',
    '<section class="pg-sec"><div class="pg-sec-inner"><div class="pg-cards">' + ''.join(
        f'<a class="pg-card" href="{u}"><div class="pg-card-k">{k}</div><h3>{t}</h3><p>{d}</p><span>Read &rarr;</span></a>' for u, k, t, d in [
            ('/guides/how-many-sheets.html', 'Guide + calculator', 'How many sheets do I need?', 'Why the area sum under-orders, and a calculator that nests your parts for the real count.'),
            ('/guides/saw-kerf.html', 'Guide', 'Kerf: the millimetres that cost you parts', 'Typical kerf and part spacing for saws, routers, laser, plasma and punch, with a worked example.'),
            ('/choosing-a-cut-list-optimiser.html', 'Checklist', 'Choosing a cut list optimiser', 'Twelve questions to ask any cut list or nesting tool before you commit.'),
            ('/sheet-metal.html', 'Trade', 'Sheet metal fabricators', 'Nesting, grain lock for brushed finishes, DXF and quotes from the layout.'),
            ('/joinery.html', 'Trade', 'Joiners &amp; cabinet makers', 'Panel saw cut lists, grain per part and labels for every piece.'),
            ('/signs-and-plastics.html', 'Trade', 'Signs &amp; plastics', 'More signs from every sheet of acrylic and composite.'),
            ('/bar-and-tube.html', 'Trade', 'Bar, tube &amp; extrusion', 'The fewest bars, a saw list per pattern and the offcuts worth keeping.'),
        ]) + '</div></div></section>',
    crumb=[('Home', '/'), ('Guides', '/guides.html')], eyebrow='CutNest'))


# ── SHARED PARTS INTO index.html ─────────────────────────────────
def sync_index():
    fp = os.path.join(ROOT, 'index.html')
    s = open(fp).read()
    for start, end, block in (('<!-- SITE:NAV', '<!-- /SITE:NAV -->', NAV), ('<!-- SITE:FOOTER', '<!-- /SITE:FOOTER -->', FOOTER)):
        a, b = s.find(start), s.find(end)
        if a == -1 or b == -1:
            raise SystemExit('index.html is missing the ' + start + ' markers')
        s = s[:a] + block + s[b + len(end):]
    open(fp, 'w').write(s)


def sitemap():
    urls = [('/', '1.0', 'weekly')] + [(p, '0.7' if not p.startswith('/guides') else '0.6', 'monthly') for p in PAGES] + \
           [('/terms.html', '0.3', 'yearly'), ('/privacy.html', '0.3', 'yearly')]
    out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url>\n    <loc>{SITE}{u}</loc>\n    <lastmod>{UPDATED}</lastmod>\n    <changefreq>{c}</changefreq>\n    <priority>{p}</priority>\n  </url>\n'
        for u, p, c in urls) + '</urlset>\n'
    open(os.path.join(ROOT, 'sitemap.xml'), 'w').write(out)


if __name__ == '__main__':
    sync_index()
    sitemap()
    print('wrote', len(PAGES), 'pages, index.html nav/footer, sitemap.xml')
