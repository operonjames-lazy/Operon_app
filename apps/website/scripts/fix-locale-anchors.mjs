// Post-build pass: localised FAQ files use lang-suffixed section IDs
// (e.g. /ja/hero-prototype-O-faq.html has id="basics_ja", not id="basics").
// Build-i18n.mjs copies the EN nodes-page FAQ tile anchors verbatim into
// every locale, which means /ja/…-nodes.html links to #basics in /ja/…
// -faq.html — that section doesn't exist there.
//
// This script rewrites the 6 FAQ tile anchors per locale to use the
// lang-suffixed IDs.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

const LANGS = ['zh-cn', 'zh-tw', 'ko', 'ja', 'th', 'vi'];

// Order of FAQ tile anchors on the nodes page, matching the order they
// appear in the markup. These are the EN-side section IDs the build
// emits; we suffix each one with `_<lang>` (with dashes converted to
// underscores so `zh-cn` → `_zh_cn`).
const ANCHOR_ORDER = ['basics', 'basics', 'transfer', 'earnings', 'sale', 'earnings'];

async function processFile(absPath, lang) {
  let html = await fs.readFile(absPath, 'utf8');
  const suffix = '_' + lang.replace(/-/g, '_');

  // Walk the 6 anchors in order. We rewrite each `href="hero-prototype
  // -O-faq.html#<base>"` → `href="hero-prototype-O-faq.html#<base><suffix>"`.
  // Use a lastIndex-based loop because we want to rewrite each occurrence
  // independently (some anchors share a base like `basics`).
  const re = /href="hero-prototype-O-faq\.html#([a-z]+)"/g;
  let i = 0;
  html = html.replace(re, (match, base) => {
    if (i >= ANCHOR_ORDER.length) return match;
    // Sanity: the base in the file should match the order we expected.
    // If it doesn't (someone reordered tiles in the source), leave the
    // anchor alone for the unexpected ones — better to skip than break.
    if (base !== ANCHOR_ORDER[i]) {
      i++;
      return match;
    }
    i++;
    return `href="hero-prototype-O-faq.html#${base}${suffix}"`;
  });

  await fs.writeFile(absPath, html, 'utf8');
}

async function main() {
  for (const lang of LANGS) {
    const file = path.join(root, lang, 'hero-prototype-O-nodes.html');
    try {
      await fs.access(file);
    } catch {
      continue;
    }
    await processFile(file, lang);
    console.log(`updated ${path.relative(root, file)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
