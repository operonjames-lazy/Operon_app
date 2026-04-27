// Post-build pass: localized FAQ files use lang-suffixed section IDs
// (e.g. /ja/hero-prototype-O-faq.html has id="basics_ja", not id="basics").
// Build-i18n.mjs copies EN FAQ tile anchors verbatim into every locale, so
// this script rewrites those anchors to match the localized FAQ IDs.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

const LANGS = ['zh-cn', 'zh-tw', 'ko', 'ja', 'th', 'vi'];
const PAGES = ['hero-prototype-O.html', 'index.html', 'hero-prototype-O-nodes.html'];
const FAQ_ANCHORS = new Set(['basics', 'transfer', 'earnings', 'sale']);

async function processFile(absPath, lang) {
  let html = await fs.readFile(absPath, 'utf8');
  const suffix = '_' + lang.replace(/-/g, '_');

  html = html.replace(/href="hero-prototype-O-faq\.html#([a-z]+)"/g, (match, base) => {
    if (!FAQ_ANCHORS.has(base)) return match;
    return `href="hero-prototype-O-faq.html#${base}${suffix}"`;
  });

  await fs.writeFile(absPath, html, 'utf8');
}

async function main() {
  for (const lang of LANGS) {
    for (const page of PAGES) {
      const file = path.join(root, lang, page);
      try {
        await fs.access(file);
      } catch {
        continue;
      }
      await processFile(file, lang);
      console.log(`updated ${path.relative(root, file)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
