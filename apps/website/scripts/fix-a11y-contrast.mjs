// One-shot: improve a11y across every prototype-O HTML page.
//
//   1. Bump --t4 alpha (0.45/0.30 → 0.62/0.55) so small labels meet
//      WCAG AA on the near-black bg.
//   2. Inject a global :focus-visible rule (currently only the lang
//      switcher is styled; CTAs, nav links, FAQ tiles all show no
//      focus indicator).
//   3. Inject a `@media (prefers-reduced-motion: reduce)` block that
//      neutralises the heavy hex pulse, blink-green dots, fadeUp/
//      spotIn / nodePulse / tokenTravel animations.
//
// Idempotent: existing focus-visible / reduced-motion injections are
// detected and skipped.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

const FOCUS_SENTINEL = '/* === a11y: keyboard focus === */';
const RM_SENTINEL = '/* === a11y: prefers-reduced-motion === */';

const FOCUS_RULE = `
${FOCUS_SENTINEL}
:focus-visible {
  outline: 2px solid var(--ice, #93C5FD);
  outline-offset: 3px;
  border-radius: 4px;
}
.lang-switcher:focus-visible,
.lang-switcher:focus {
  outline: 2px solid var(--ice, #93C5FD);
  outline-offset: 3px;
}
/* Dead-link disable: any anchor still pointing at "#" is a placeholder
   that scrolls-to-top in production. Visually demote it and stop the
   click. The footer "Read the deck" CTA, footer link columns, etc. all
   read as disabled instead of broken. */
a[href="#"], a[href=""] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
a[href="#"]::after, a[href=""]::after { content: ''; }
`.trim();

const RM_RULE = `
${RM_SENTINEL}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0s !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .radial-grid .hex,
  .feed-label::before,
  .status-pill .status-dot,
  .hero-pill .dot,
  .caret {
    animation: none !important;
  }
}
`.trim();

async function processFile(absPath) {
  let html = await fs.readFile(absPath, 'utf8');
  let changed = false;

  // 1. Bump --t4 contrast.
  const t4Spaced = html.replace(
    /--t4:\s*rgba\(170,\s*188,\s*220,\s*0\.45\)/g,
    '--t4: rgba(170, 188, 220, 0.62)'
  );
  if (t4Spaced !== html) { html = t4Spaced; changed = true; }
  const t4Compact = html.replace(
    /--t4:rgba\(170,188,220,0\.30\)/g,
    '--t4:rgba(170,188,220,0.55)'
  );
  if (t4Compact !== html) { html = t4Compact; changed = true; }

  // 2. Strip any prior a11y blocks (idempotent re-apply when the rule
  //    contents change between runs) and re-inject the current ones.
  const stripFocus = new RegExp(
    `\\n?${FOCUS_SENTINEL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=<\\/style>|\\n\\/\\* === a11y: prefers-reduced-motion === \\*\\/)`,
    'g'
  );
  const stripRM = new RegExp(
    `\\n?${RM_SENTINEL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=<\\/style>)`,
    'g'
  );
  const before = html;
  html = html.replace(stripFocus, '').replace(stripRM, '');
  if (html !== before) changed = true;

  // Now inject the current versions.
  html = html.replace(
    /<\/style>/,
    `\n${FOCUS_RULE}\n${RM_RULE}\n</style>`
  );
  changed = true;

  if (changed) {
    await fs.writeFile(absPath, html, 'utf8');
  }
  return changed;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'public' || entry.name === 'components' || entry.name === 'i18n' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full);
      files.push(...nested);
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const files = await walk(root);
  let touched = 0;
  for (const file of files) {
    // Only target prototype-O pages and the per-locale index.html
    const base = path.basename(file);
    if (!base.startsWith('hero-prototype-O') && base !== 'index.html') continue;
    const changed = await processFile(file);
    console.log(`${changed ? 'updated' : 'skip   '} ${path.relative(root, file)}`);
    if (changed) touched++;
  }
  console.log(`\ntotal ${touched} files updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
