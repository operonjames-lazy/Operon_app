// Client-side language router for the prototype-O ecosystem.
// - First-visit browser detect: redirects EN root → matched slug dir if user has no preference.
// - Lang switcher: changes URL to sibling page in target language.
// - Persists user choice in localStorage('operon-lang').
//
// URL slugs are country codes: cn, tw, kr, jp, th, vn (EN at root).
// HTML <html lang> attribute uses ISO codes (zh-CN, zh-TW, ko, ja, th, vi).

(function () {
  var SUPPORTED = ['en', 'cn', 'tw', 'kr', 'jp', 'th', 'vn'];

  // ISO browser-language → URL slug.
  var ISO_TO_SLUG = {
    'en': 'en',
    'zh-cn': 'cn',
    'zh-hans': 'cn',
    'zh': 'cn',
    'zh-tw': 'tw',
    'zh-hant': 'tw',
    'zh-hk': 'tw',
    'ko': 'kr',
    'ja': 'jp',
    'th': 'th',
    'vi': 'vn',
  };

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

  // app.operon.network is not live yet. Convert any anchor pointing there into
  // a click-to-"Coming soon" affordance — first click swaps inner text to the
  // localised "Coming soon" string and disables further interaction.
  function wireComingSoonCtas() {
    var sourceEl = document.querySelector('#i18nStrings [data-i18n="common.coming_soon"]');
    var label = (sourceEl && sourceEl.textContent.trim()) || 'Coming soon';
    document.querySelectorAll('a[href^="https://app.operon.network"]').forEach(function (a) {
      if (a.dataset.comingSoonWired) return;
      a.dataset.comingSoonWired = '1';
      a.addEventListener('click', function (event) {
        event.preventDefault();
        if (a.classList.contains('is-coming-soon')) return;
        a.classList.add('is-coming-soon');
        a.setAttribute('aria-disabled', 'true');
        a.textContent = label;
      });
    });
  }

  function detectBrowserSlug() {
    var raw = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (ISO_TO_SLUG[raw]) return ISO_TO_SLUG[raw];
    // Try prefix match (e.g. zh-hans-cn → zh-hans, ja-jp → ja)
    for (var i = raw.length; i > 0; i--) {
      var trimmed = raw.slice(0, i);
      if (ISO_TO_SLUG[trimmed]) return ISO_TO_SLUG[trimmed];
    }
    var base = raw.split('-')[0];
    if (ISO_TO_SLUG[base]) return ISO_TO_SLUG[base];
    return 'en';
  }

  // Returns { slug, file } given location.pathname.
  // file is the bare slug ('' for the directory index, 'agents' / 'faq#x' etc.)
  // /             → { slug: 'en', file: '' }
  // /agents       → { slug: 'en', file: 'agents' }
  // /agents.html  → { slug: 'en', file: 'agents' }   (.html stripped on parse)
  // /jp/          → { slug: 'jp', file: '' }
  // /jp/faq      → { slug: 'jp', file: 'faq' }
  function parsePath() {
    var path = location.pathname.replace(/\/+$/, '/');
    var parts = path.split('/').filter(Boolean);
    var stripHtml = function (f) {
      if (!f) return '';
      // 'index.html' / 'index' → '' (directory root)
      var bare = f.replace(/\.html$/, '');
      return bare === 'index' ? '' : bare;
    };
    if (parts.length === 0) return { slug: 'en', file: '' };
    var maybeSlug = parts[0];
    if (SUPPORTED.indexOf(maybeSlug) !== -1 && maybeSlug !== 'en') {
      return { slug: maybeSlug, file: stripHtml(parts.slice(1).join('/')) };
    }
    return { slug: 'en', file: stripHtml(parts.join('/')) };
  }

  function urlFor(slug, file) {
    var base = slug === 'en' ? '/' : '/' + slug + '/';
    return base + (file || '');
  }

  var current = parsePath();

  if (current.slug === 'en' && !localStorage.getItem(KEY)) {
    var detected = detectBrowserSlug();
    if (detected !== 'en' && SUPPORTED.indexOf(detected) !== -1) {
      localStorage.setItem(KEY, detected);
      location.replace(urlFor(detected, current.file));
      return;
    }
  }

  function wireSwitcher() {
    var sw = document.getElementById('langSwitcher');
    if (!sw) return;
    var def = sw.getAttribute('data-default') || current.slug;
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
      wireComingSoonCtas();
    });
  } else {
    disablePlaceholderLinks();
    wireSwitcher();
    wireComingSoonCtas();
  }
})();
