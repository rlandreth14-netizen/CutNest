// LinkedIn post copy, one entry per asset, in posting order.
// kit.js turns this into out/linkedin-posts.md and the launch-kit page.
'use strict';
const link = c => 'https://cutnest.co.uk/?utm_source=linkedin&utm_medium=social&utm_campaign=' + c;
const TAGS = '#fabrication #sheetmetal #joinery #manufacturing #smallbusiness';

module.exports = [
  {
    id: 'launch', when: 'Week 1 · Tue', asset: 'post-01-launch.png', kind: 'image', title: 'Launch',
    text: `I've over-ordered sheet material more times than I'd like to admit.

Never by much. A sheet here, a sheet there. On stainless that's real money, and it happens because the quick sum on the back of a drawing is wrong more often than you'd think.

So I built CutNest.

You paste in your cut list and pick the sheet sizes you buy. It nests every part before you order, tells you exactly how many sheets you need, and draws each one to scale with numbered cuts. When the answer is the proven minimum, it says so.

It does bar and tube too: box section, angle, flat bar, extrusion.

It runs in your browser. No account, no install, and your cut lists stay on your computer.

It's free to use. If you price jobs, Pro turns the layout into a customer quote on your letterhead for £12 a month.

I'd really value feedback from anyone who cuts sheet or bar for a living. Try it on your last job and tell me what it gets wrong.

Link in the first comment.

${TAGS}`,
    comment: `Try it free, no account needed: ${link('launch')}`,
  },
  {
    id: 'walkthrough', when: 'Week 1 · Thu', asset: 'video-app-walkthrough.mp4', kind: 'video', title: 'App walkthrough (28s)',
    text: `Cut list to customer quote in under 30 seconds. This is a real screen recording of CutNest, not a mock-up.

1. Paste the list straight from an email or spreadsheet. Most formats work, in mm or inches.
2. Calculate. It finds the fewest sheets on the sizes you actually buy.
3. It shows the material cost, and whether the result is proven optimal.
4. Every sheet is drawn to scale, ready for the shop floor.
5. With Pro, add the customer and any extras, and the quote is done.

That was recorded on a phone. It works the same on a laptop in the office.

Free to try. Link in the comments.

${TAGS}`,
    comment: `Try it on your own cut list: ${link('walkthrough')}`,
  },
  {
    id: 'story', when: 'Week 2 · Tue', asset: 'post-02-story.png', kind: 'image', title: 'One real job',
    text: `We had a job down for 4 sheets of 316 brushed stainless. It needed 3.

The quick sum said 4. Nesting the parts properly before ordering said 3.

That's £225 back on a single job, and one less offcut leaning against the wall for a year.

It isn't a big number on its own. Across a year of jobs, it adds up.

Nest it before you order it.

${TAGS}`,
    comment: `This is the tool I used to nest it. Free, runs in your browser: ${link('story')}`,
  },
  {
    id: 'carousel', when: 'Week 2 · Thu', asset: 'carousel-5-reasons.pdf', preview: 'carousel-cover.png', kind: 'document', title: 'Carousel: 5 reasons',
    docTitle: "5 reasons you're over-ordering sheet material",
    text: `Most shops over-order sheet material, and the usual shortcuts are the reason.

I've put the five I see most into a short carousel:

1. The area sum lies
2. Kerf adds up
3. Grain locks you in
4. Full sheets aren't always cheapest
5. Offcuts go in the skip

Every layout in it is a real nest, not a drawing.

Which one catches your shop out most?

${TAGS}`,
    comment: `Nest your next job before you order it, free: ${link('carousel')}`,
  },
  {
    id: 'areamyth', when: 'Week 3 · Tue', asset: 'post-03-areamyth.png', kind: 'image', title: 'The area sum',
    text: `Total parts area ÷ sheet area said 2 sheets. The job needed 3.

Two 1400×700 desk tops, four leg panels and two modesty panels, on 2440×1220 sheets.

On paper the area fits in 2. In practice two 700mm-deep tops can't sit side by side on a 1220 sheet, and two 1400mm tops can't sit end to end on a 2440 one. Each top takes a sheet, and everything else has to fit around them.

Parts don't pour like water. The only way to know is to nest them.

If you order off the area sum, you'll get caught out on exactly the jobs where it matters: big parts, few of them.

${TAGS}`,
    comment: `I wrote up how to work out sheet quantities properly: https://cutnest.co.uk/guides/how-many-sheets.html?utm_source=linkedin&utm_medium=social&utm_campaign=areamyth`,
  },
  {
    id: 'overview', when: 'Week 3 · Thu', asset: 'video-30s-overview.mp4', preview: 'video-30s-overview-cover.png', kind: 'video', title: '30s overview video',
    text: `What CutNest does, in 30 seconds.

It works out the fewest sheets or bars for a job, proves it when it can, and turns the layout into a customer quote.

Sheet metal, timber, acrylic, bar and tube. Free in your browser, no account.

${TAGS}`,
    comment: `Try it: ${link('overview')}`,
  },
  {
    id: 'kerf', when: 'Week 4 · Tue', asset: 'post-04-kerf.png', kind: 'image', title: 'Kerf',
    text: `1mm of kerf cost me 4 parts a sheet.

606×300 parts on a 2440×1220 sheet. Four across is 2424mm of parts, plus three cuts.

At 5mm kerf: 2424 + 15 = 2439mm. It fits. 16 parts a sheet.
At 6mm kerf: 2424 + 18 = 2442mm. It doesn't. 12 parts a sheet.

Whether it's a laser, a plasma, a panel saw or a CNC router, put your real kerf in, to the tenth of a mm. A rounded-up guess can cost you a sheet.

In CutNest you can set kerf per material, so the laser and the saw don't have to share one number.

${TAGS}`,
    comment: `More on kerf, and how to measure yours: https://cutnest.co.uk/guides/saw-kerf.html?utm_source=linkedin&utm_medium=social&utm_campaign=kerf`,
  },
  {
    id: 'quote', when: 'Week 4 · Thu', asset: 'post-06-quote.png', kind: 'image', title: 'Quotes (Pro)',
    text: `How long does it take you to price a sheet job?

For most small shops it's a calculator, a spreadsheet and a guess at the cutting time.

CutNest Pro prices it from the actual layout:
• Material, with your markup
• Cutting time from the real cut length
• Handling, and extras like delivery
• VAT

It comes out as a PDF on your letterhead, ready to send.

£12 a month per company, and the whole team can use it.

${TAGS}`,
    comment: `The nesting is free. Pro adds quotes, labels, DXF and more: ${link('quote')}`,
  },
  {
    id: 'bars', when: 'Week 5 · Tue', asset: 'post-05-bars.png', kind: 'image', title: 'Bar & tube',
    text: `Sheet nesting gets the attention. Cutting lengths from bar is where plenty of good offcut ends up in the skip.

Box section, angle, flat bar, extrusion, timber: enter the stock lengths you buy and the lengths you need. CutNest finds the fewest bars, gives you a saw list per pattern, and flags the offcuts long enough to be worth racking.

This one is 3 bars of 7.5m 40×40×3 SHS, and it's proven optimal. No plan uses fewer bars.

Bar and tube is free on every plan.

${TAGS}`,
    comment: `Bar and tube cutting, free: https://cutnest.co.uk/bar-and-tube.html?utm_source=linkedin&utm_medium=social&utm_campaign=bars`,
  },
  {
    id: 'optimal', when: 'Week 5 · Thu', asset: 'post-07-optimal.png', kind: 'image', title: 'Provably optimal',
    text: `Most nesting software gives you a good answer. Very little of it tells you whether it's the best one.

CutNest checks every result against a mathematical lower bound: the fewest sheets any layout could possibly use.

When the result hits that bound, it's marked provably optimal. No other software, and no amount of fiddling by hand, can do that job in fewer sheets.

When it can't prove it, it tells you that too.

I'd rather give you a straight answer than a confident guess.

${TAGS}`,
    comment: `See it on one of your own jobs: ${link('optimal')}`,
  },
  {
    id: 'free', when: 'Week 6 · Tue', asset: 'post-08-free.png', kind: 'image', title: 'Free, no account',
    text: `A quick recap for anyone who's found CutNest recently.

Free, in your browser, no account:
• Sheet metal, timber and acrylic, plus bar and tube
• Paste a cut list or open an Excel file, in mm or inches
• Cut sheets and saw lists for the shop floor

Pro is £12 a month per company:
• Customer quotes on your letterhead
• Up to 5 materials per job, DXF export, part labels, stock limits

Your cut lists stay on your computer. Nothing is uploaded.

If you've tried it, I'd love to hear how it went, good or bad.

${TAGS}`,
    comment: `${link('free')}`,
  },
];
