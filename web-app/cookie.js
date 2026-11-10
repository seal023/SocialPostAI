/* SocialPostAI Pro — minimal cookie consent + footer year helper.
   Self-contained: injects the consent bar on first load, persists choice in
   localStorage, and fills any #year span. Included on every page. */
(function () {
  'use strict';

  // Keep footer copyright year current on every page.
  try {
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  } catch (e) { /* no-op */ }

  var KEY = 'spai_cookie_consent';

  function dismissed() {
    try { return localStorage.getItem(KEY) === 'accepted'; } catch (e) { return false; }
  }

  function accept() {
    try { localStorage.setItem(KEY, 'accepted'); } catch (e) { /* no-op */ }
    var bar = document.getElementById('cookieBar');
    if (bar) bar.remove();
  }

  function showBar() {
    if (dismissed()) return;
    if (document.getElementById('cookieBar')) return;

    var bar = document.createElement('div');
    bar.id = 'cookieBar';
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.innerHTML =
      '<p class="cookie-text">We use cookies to operate the site and remember your free-tier usage. ' +
      'By continuing, you agree to our <a href="/privacy.html">Privacy Policy</a> and ' +
      '<a href="/aup.html">Acceptable Use Policy</a>.</p>' +
      '<button type="button" class="cookie-accept" id="cookieAccept">Accept</button>';

    document.body.appendChild(bar);
    var btn = document.getElementById('cookieAccept');
    if (btn) btn.addEventListener('click', accept);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBar);
  } else {
    showBar();
  }
})();
