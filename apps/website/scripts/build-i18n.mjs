// Build per-language directories from EN HTML source files + i18n dicts.
//
// Source of truth: apps/website/{index,agents,nodes,affiliates,faq}.html (EN inline)
// Translation dicts: apps/website/i18n/<slug>.json (key → translated string)
// Output: apps/website/<slug>/{index,agents,nodes,affiliates,faq}.html
//
// URL slug uses country codes (cn, tw, kr, jp, th, vn). HTML lang attribute and
// hreflang values stay as ISO 639-1 lang codes (zh-CN, zh-TW, ko, ja, th, vi).
//
// Convention: data-i18n="key" only on leaf elements (h1, h2, p, a, span, button…).
// Translation values may contain inline HTML (<span>, <em>, <br>, <strong>).
// Cross-page links use relative filenames so each <slug>/ dir is self-contained.
//
// FAQ has its own pre-existing inline translations (lang-content data-lang="X").
// Build splits them into per-language files using extractFaqLanguage().

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const I18N_DIR = join(ROOT, 'i18n');

// URL slug → ISO HTML lang code.
export const HTML_LANG_MAP = {
  cn: 'zh-CN',
  tw: 'zh-TW',
  kr: 'ko',
  jp: 'ja',
  th: 'th',
  vn: 'vi',
  en: 'en',
};

// FAQ uses ISO lang codes in its data-lang blocks; map slug → FAQ block id.
export const FAQ_LANG_MAP = {
  cn: 'zh-cn',
  tw: 'zh-tw',
  kr: 'ko',
  jp: 'ja',
  th: 'th',
  vn: 'vi',
  en: 'en',
};

export const LANGS = ['cn', 'tw', 'kr', 'jp', 'th', 'vn'];

const DICT_FILES = ['index.html', 'agents.html', 'nodes.html', 'affiliates.html'];
const FAQ_FILE = 'faq.html';
const POST_BUILD_SCRIPTS = ['fix-seo-meta.mjs', 'fix-locale-anchors.mjs', 'fix-a11y-contrast.mjs'];

// Walks HTML for tags carrying data-i18n="key", finds their balanced closing tag
// (handles nested same-name children, e.g. <span data-i18n><span class="v">$X</span></span>),
// and replaces the inner body with dict[key]. Falls through unchanged if key is missing.
function applyDict(html, dict) {
  const openRe = /<([a-z][a-z0-9]*)\b([^>]*?)\bdata-i18n="([^"]+)"([^>]*?)>/g;
  let out = '';
  let cursor = 0;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const [matchStr, tag, before, key, after] = m;
    const openStart = m.index;
    const innerStart = openStart + matchStr.length;

    // Walk forward counting <tag.../>-open and </tag>-close to find matching close.
    let depth = 1;
    let i = innerStart;
    let innerEnd = -1;
    let closeEnd = -1;
    const openTok = '<' + tag;
    const closeTok = '</' + tag + '>';
    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf(openTok, i);
      const nextClose = html.indexOf(closeTok, i);
      if (nextClose === -1) break;
      // Confirm nextOpen is a real start tag (followed by whitespace, '>', or '/')
      let validOpen = -1;
      if (nextOpen !== -1) {
        const ch = html[nextOpen + openTok.length];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '>' || ch === '/') {
          validOpen = nextOpen;
        }
      }
      if (validOpen !== -1 && validOpen < nextClose) {
        depth++;
        i = validOpen + openTok.length;
      } else {
        depth--;
        if (depth === 0) {
          innerEnd = nextClose;
          closeEnd = nextClose + closeTok.length;
        }
        i = nextClose + closeTok.length;
      }
    }
    if (innerEnd === -1) {
      out += html.slice(cursor, m.index + matchStr.length);
      cursor = m.index + matchStr.length;
      continue;
    }
    out += html.slice(cursor, openStart);
    const v = dict[key];
    if (v === undefined || v === null) {
      out += html.slice(openStart, closeEnd);
    } else {
      out += `<${tag}${before}data-i18n="${key}"${after}>${v}</${tag}>`;
    }
    cursor = closeEnd;
    openRe.lastIndex = closeEnd;
  }
  out += html.slice(cursor);
  return out;
}

function setHtmlLang(html, slug) {
  return html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${HTML_LANG_MAP[slug]}"`);
}

function setLangSwitcherDefault(html, slug) {
  return html.replace(
    /<select([^>]*\bclass="[^"]*\blang-switcher\b[^"]*"[^>]*)>/,
    (m, attrs) => {
      const cleaned = attrs.replace(/\s+data-default="[^"]*"/g, '');
      return `<select${cleaned} data-default="${slug}">`;
    }
  );
}

// Extract a single lang's content out of the multi-lang FAQ file. The FAQ uses
// ISO lang codes for data-lang, so callers must pass the ISO code (en, ko, …).
function extractFaqLanguage(html, isoLang) {
  const openRe = /<div\s+class="lang-content[^"]*"\s+data-lang="([^"]+)">/g;
  const blocks = [];
  let m;
  while ((m = openRe.exec(html))) {
    const start = m.index;
    const innerStart = m.index + m[0].length;
    const lang = m[1];
    let depth = 1;
    let i = innerStart;
    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', i);
      const nextClose = html.indexOf('</div>', i);
      if (nextClose === -1) throw new Error('FAQ: unbalanced div');
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          blocks.push({ start, innerStart, end: nextClose, closeEnd: nextClose + 6, lang });
        }
        i = nextClose + 6;
      }
    }
    openRe.lastIndex = blocks.length ? blocks[blocks.length - 1].closeEnd : openRe.lastIndex;
  }

  if (!blocks.some((b) => b.lang === isoLang)) {
    throw new Error(`FAQ: no lang-content block for "${isoLang}"`);
  }

  let out = html;
  const sorted = blocks.slice().sort((a, b) => b.start - a.start);
  for (const block of sorted) {
    if (block.lang === isoLang) {
      const inner = out.slice(block.innerStart, block.end);
      out = out.slice(0, block.start) + inner + out.slice(block.closeEnd);
    } else {
      out = out.slice(0, block.start) + out.slice(block.closeEnd);
    }
  }
  return out;
}

function build() {
  for (const slug of LANGS) {
    const dictPath = join(I18N_DIR, `${slug}.json`);
    const outDir = join(ROOT, slug);
    mkdirSync(outDir, { recursive: true });

    let dict = {};
    if (existsSync(dictPath)) {
      try {
        dict = JSON.parse(readFileSync(dictPath, 'utf8'));
      } catch (e) {
        console.warn(`[${slug}] bad JSON in ${dictPath}: ${e.message} — using empty dict`);
      }
    } else {
      console.warn(`[${slug}] no dict at ${dictPath} — emitting EN content`);
    }

    for (const file of DICT_FILES) {
      const inPath = join(ROOT, file);
      if (!existsSync(inPath)) {
        console.warn(`  skip ${file} (missing)`);
        continue;
      }
      let html = readFileSync(inPath, 'utf8');
      html = setHtmlLang(html, slug);
      html = applyDict(html, dict);
      html = setLangSwitcherDefault(html, slug);
      writeFileSync(join(outDir, file), html);
    }

    const faqPath = join(ROOT, FAQ_FILE);
    if (existsSync(faqPath)) {
      let faqHtml = readFileSync(faqPath, 'utf8');
      try {
        let langHtml = extractFaqLanguage(faqHtml, FAQ_LANG_MAP[slug]);
        langHtml = setHtmlLang(langHtml, slug);
        langHtml = setLangSwitcherDefault(langHtml, slug);
        writeFileSync(join(outDir, FAQ_FILE), langHtml);
      } catch (e) {
        console.warn(`[${slug}] FAQ extract failed: ${e.message}`);
      }
    }

    console.log(`✓ ${slug} → apps/website/${slug}/`);
  }

  for (const script of POST_BUILD_SCRIPTS) {
    const scriptPath = join(__dirname, script);
    if (existsSync(scriptPath)) {
      execFileSync(process.execPath, [scriptPath], { stdio: 'inherit' });
    }
  }

  console.log('Build complete.');
}

build();
