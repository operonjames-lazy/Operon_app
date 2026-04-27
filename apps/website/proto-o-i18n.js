// Client-side language router for the prototype-O ecosystem.
// - First-visit browser detect: redirects EN root → matched lang dir if user has no preference.
// - Lang switcher: changes URL to sibling page in target language.
// - Persists user choice in localStorage('operon-lang').
//
// Path scheme: EN at root (/hero-prototype-O*.html), other langs at /<lang>/hero-prototype-O*.html.

(function () {
  var SUPPORTED = ['en', 'zh-cn', 'zh-tw', 'ko', 'ja', 'th', 'vi'];
  var KEY = 'operon-lang';

  function disablePlaceholderLinks() {
    document.querySelectorAll('a[href="#"], a[href=""]').forEach(function (a) {
      a.setAttribute('aria-disabled', 'true');
      a.setAttribute('tabindex', '-1');
      a.addEventListener('click', function (event) {
        event.preventDefault();
      });
    });
  }

  function detectBrowserLang() {
    var raw = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    // Exact match (zh-cn, zh-tw, …)
    if (SUPPORTED.indexOf(raw) !== -1) return raw;
    // Map zh-* without region → zh-cn (simplified is the more common default)
    if (raw === 'zh' || raw.indexOf('zh-hans') === 0) return 'zh-cn';
    if (raw.indexOf('zh-hant') === 0) return 'zh-tw';
    // Stripped: en-us → en, ja-jp → ja
    var base = raw.split('-')[0];
    if (SUPPORTED.indexOf(base) !== -1) return base;
    return 'en';
  }

  // Returns { lang, file } given location.pathname.
  // /hero-prototype-O.html → { lang: 'en', file: 'hero-prototype-O.html' }
  // /ja/hero-prototype-O.html → { lang: 'ja', file: 'hero-prototype-O.html' }
  // /ja/ → { lang: 'ja', file: 'hero-prototype-O.html' } (default)
  function parsePath() {
    var path = location.pathname.replace(/\/+$/, '/'); // normalize trailing
    var parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return { lang: 'en', file: 'hero-prototype-O.html' };
    var maybeLang = parts[0];
    if (SUPPORTED.indexOf(maybeLang) !== -1 && maybeLang !== 'en') {
      var file = parts.slice(1).join('/') || 'hero-prototype-O.html';
      return { lang: maybeLang, file: file };
    }
    return { lang: 'en', file: parts.join('/') };
  }

  function urlFor(lang, file) {
    if (lang === 'en') return '/' + file;
    return '/' + lang + '/' + file;
  }

  var current = parsePath();

  // First-visit auto-redirect: only on EN, only if user hasn't set a preference.
  if (current.lang === 'en' && !localStorage.getItem(KEY)) {
    var detected = detectBrowserLang();
    if (detected !== 'en' && SUPPORTED.indexOf(detected) !== -1) {
      // Mark detection done so back-button doesn't loop.
      localStorage.setItem(KEY, detected);
      location.replace(urlFor(detected, current.file));
      return;
    }
  }

  // Wire the lang switcher. The switcher's data-default attribute carries the
  // build-time lang. Browser keeps the user-selected option synced via change.
  function wireSwitcher() {
    var sw = document.getElementById('langSwitcher');
    if (!sw) return;
    var def = sw.getAttribute('data-default') || current.lang;
    sw.value = def;
    sw.addEventListener('change', function () {
      var target = sw.value;
      localStorage.setItem(KEY, target);
      location.href = urlFor(target, current.file);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      disablePlaceholderLinks();
      wireSwitcher();
    });
  } else {
    disablePlaceholderLinks();
    wireSwitcher();
  }
})();
