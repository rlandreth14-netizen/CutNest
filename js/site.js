// ════════════════════════════════════════════════════════════════
//  CutNest website: shared by the home page, trade pages and guides.
//  Loaded in <head> (not deferred) so a returning visitor who accepted
//  analytics is counted from the first event; everything that touches the
//  page waits for DOMContentLoaded.
// ════════════════════════════════════════════════════════════════

// ── ANALYTICS — CONSENT GATED ──
// Google Analytics is NOT loaded until the visitor accepts on the cookie
// banner (or accepted before), and never under Do Not Track. Loading it
// unconditionally set cookies before consent existed, which contradicted the
// privacy policy's stated legal basis.
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
function loadAnalytics(){
  if (window.__cnAnalyticsLoaded) return;
  window.__cnAnalyticsLoaded = true;
  var sc = document.createElement('script');
  sc.async = true;
  sc.src = 'https://www.googletagmanager.com/gtag/js?id=G-EGY30977X1';
  document.head.appendChild(sc);
  gtag('js', new Date());
  gtag('config','G-EGY30977X1',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});
}
// An event, only if the visitor agreed to analytics. Nothing is queued
// otherwise, so declining sends nothing, ever.
function cnTrack(name, params){
  try { if (window.__cnAnalyticsLoaded) gtag('event', name, params || {}); } catch (e) {}
}
var _cnDnt = (navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.msDoNotTrack==='1');
try{
  if (localStorage.getItem('cn-cookie') === 'accepted' && !_cnDnt) loadAnalytics();
}catch(e){}

function acceptCookie() {
  try{ localStorage.setItem('cn-cookie','accepted'); }catch(e){}
  var c = document.getElementById('cookie'); if (c) c.classList.remove('show');
  if (!_cnDnt) loadAnalytics();
}
function declineCookie() {
  try{ localStorage.setItem('cn-cookie','declined'); }catch(e){}
  var c = document.getElementById('cookie'); if (c) c.classList.remove('show');
  // Nothing to unload: GA was never injected.
}

// ════════════════════════════════════════════════════════════════
// ⚠️ LEMON SQUEEZY CONFIG — THE ONLY PLACE YOU EVER CHANGE THE URL
// There is ONE product and ONE checkout link: the monthly subscription.
// If you add an annual variant later, add its URL here AND restore a billing
// toggle on the pricing card — never one without the other, or the page
// advertises a price the checkout does not charge.
// ════════════════════════════════════════════════════════════════
var LS_MONTHLY_URL = 'https://cutnest.lemonsqueezy.com/checkout/buy/a9fdfebb-ea08-4962-8aae-45e608f0cc6e';

// ── MOBILE NAV ──
function openNav() {
  document.getElementById('nav-mobile').classList.add('open');
  document.getElementById('nav-hamburger').setAttribute('aria-expanded', 'true');
  document.querySelector('#nav-mobile a').focus();
}
function closeNav() {
  var nav = document.getElementById('nav-mobile');
  if (!nav || !nav.classList.contains('open')) return;
  nav.classList.remove('open');
  var h = document.getElementById('nav-hamburger');
  h.setAttribute('aria-expanded', 'false');
  h.focus({ preventScroll: true });
}

function notifySignup() {
  var emailEl = document.getElementById('notify-email');
  var confirmEl = document.getElementById('notify-confirm');
  if (!emailEl) return;
  var email = emailEl.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailEl.style.borderColor = '#dc2626';
    emailEl.placeholder = 'Enter a valid email';
    return;
  }
  emailEl.style.borderColor = '';
  // There is no mailing-list backend. All this can do is open the visitor's own
  // mail client with a draft — so the confirmation says exactly that. Nothing is
  // stored: an address the site cannot act on is personal data with no purpose.
  window.location.href = 'mailto:hello@cutnest.co.uk?subject=' + encodeURIComponent('CutNest feature updates')
    + '&body=' + encodeURIComponent('Please add ' + email + ' to the CutNest updates list.');
  if (confirmEl) {
    confirmEl.textContent = '✉ Your email app should open with a draft — send it and I’ll add you.';
    confirmEl.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Cookie banner: only when no choice has been made. '1' is the legacy value
  // written before there was a Decline option; it only meant "dismissed".
  try {
    var choice = localStorage.getItem('cn-cookie');
    if (choice !== 'accepted' && choice !== 'declined') {
      setTimeout(function () { var c = document.getElementById('cookie'); if (c) c.classList.add('show'); }, 1200);
    }
  } catch (e) {
    setTimeout(function () { var c = document.getElementById('cookie'); if (c) c.classList.add('show'); }, 1200);
  }

  // Every checkout link points at the one live checkout, and is counted.
  document.querySelectorAll('a[href*="lemonsqueezy.com/checkout"]').forEach(function (a) {
    a.href = LS_MONTHLY_URL;
    a.addEventListener('click', function () { cnTrack('begin_checkout', { source: location.pathname, placement: a.getAttribute('data-placement') || '' }); });
  });
  // "Try it free" and other links into the app.
  document.querySelectorAll('a[href="/app.html"], a[href="app.html"], a[href^="/app.html?"]').forEach(function (a) {
    a.addEventListener('click', function () { cnTrack('open_app', { source: location.pathname, placement: a.getAttribute('data-placement') || '' }); });
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(function (item) {
    item.querySelector('.faq-q').addEventListener('click', function () {
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (el) {
        el.classList.remove('open');
        el.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });
});

// ── SERVICE WORKER: offline support + installable app ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
  });
}
