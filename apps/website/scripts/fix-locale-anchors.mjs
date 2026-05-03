// Post-build pass: localized FAQ files use ISO-lang-suffixed section IDs
// (e.g. /jp/faq.html has id="basics_ja", not id="basics").
// Build-i18n.mjs copies EN FAQ tile anchors verbatim into every locale, so
// this script rewrites those anchors to match the localized FAQ IDs.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

// URL slug → ISO lang code used as the FAQ id suffix.
const SLUG_TO_ISO = {
  cn: 'zh-cn',
  tw: 'zh-tw',
  kr: 'ko',
  jp: 'ja',
  th: 'th',
  vn: 'vi',
};

const SLUGS = Object.keys(SLUG_TO_ISO);
const PAGES = ['index.html', 'nodes.html'];
const FAQ_ANCHORS = new Set(['basics', 'transfer', 'earnings', 'sale']);

async function processFile(absPath, slug) {
  let html = await fs.readFile(absPath, 'utf8');
  const iso = SLUG_TO_ISO[slug];
  const suffix = '_' + iso.replace(/-/g, '_');

  html = html.replace(/href="faq#([a-z]+)"/g, (match, base) => {
    if (!FAQ_ANCHORS.has(base)) return match;
    return `href="faq#${base}${suffix}"`;
  });

  await fs.writeFile(absPath, html, 'utf8');
}

async function main() {
  for (const slug of SLUGS) {
    for (const page of PAGES) {
      const file = path.join(root, slug, page);
      try {
        await fs.access(file);
      } catch {
        continue;
      }
      await processFile(file, slug);
      console.log(`updated ${path.relative(root, file)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
