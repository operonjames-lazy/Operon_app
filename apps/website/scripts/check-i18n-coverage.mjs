// Translation coverage check — runs two passes:
//
//   1. data-i18n key parity:
//      Every data-i18n="key" found in the EN source HTML must exist as a key
//      in each <slug>.json dict; report any missing keys.
//
//   2. Untagged-text scan:
//      Scan each EN source HTML for text inside leaf-style content tags
//      (<h1-6>, <p>, <a>, <span>, <button>, <li>, <em>, <strong>) where the
//      element has no data-i18n attribute and the text contains 2+ letters
//      (skips pure numerics, single chars, OPN-IDs, etc.). Report potential
//      misses so the human can decide whether to add data-i18n.
//
// Usage: node scripts/check-i18n-coverage.mjs

import { readFileSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const I18N_DIR = join(ROOT, 'i18n');

const SLUGS = ['cn', 'tw', 'kr', 'jp', 'th', 'vn'];
const SOURCES = [
  'index.html',
  'agents.html',
  'nodes.html',
  'affiliates.html',
];

// Tags treated as leaf-content candidates for the untagged-text scan.
const LEAF_TAGS = new Set([
  'h1','h2','h3','h4','h5','h6','p','a','span','button','li','em','strong'
]);

// Allow-list: visible text we know stays English (proper nouns, brand names,
// chain names, agent IDs, currency, OPN codes, etc.). Match before reporting.
const STAY_EN_PATTERNS = [
  /^OPER[\s\S]*ON$/,                 // brand wordmark
  /^ON$/,                            // OPER<span>ON</span> wordmark suffix
  /^OPN-\d{2,3}$/,                   // OPN agent IDs
  /^0x[a-f0-9…]+/i,                  // wallet addresses
  /^\$?[\d,\.]+[a-zA-Z%]*$/,         // numbers / dollar / percent
  /^[★◆●·\-—–:•|↗→←↑↓\s]+$/,         // symbol-only
  /^(Quill|Zenith|Meridian|Atelier|Arbiter|Epoch|Herald|Scout|Bridge|Ledger|Curator|Relay|Pulse|Advocate|Scribe|Anchor|Verify|Chorus)$/,
  /^(Operon|Forge|OAMS|Arbitrum|BNB|USDC|USDT|TGE|NFT|DeFi|ERC-721|ERC-20|Chainlink|LayerZero|The Graph|X|LinkedIn|Instagram|YouTube|GitHub|Discord|Telegram)$/i,
  /^◆\s+[A-Z]/,                      // chain pill labels
  /^\s*$/,                           // whitespace only
];

function loadDict(slug) {
  const p = join(I18N_DIR, `${slug}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return null; }
}

// Pull every data-i18n="..." key out of a source HTML. Strips <script>/<style>
// blocks first so JS string literals like '[data-i18n="..."]' don't get matched.
function extractI18nKeys(html) {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const keys = [];
  const re = /\bdata-i18n="([^"]+)"/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) keys.push(m[1]);
  return keys;
}

// Walk every <tag ... data-i18n="...">...</tag> and replace its inner content
// with a single space so nested children don't show up as "untagged" leaves.
// Mirrors build-i18n.mjs's balanced-tag walker.
function maskI18nCovered(html) {
  const openRe = /<([a-z][a-z0-9]*)\b([^>]*?)\bdata-i18n="([^"]+)"([^>]*?)>/g;
  let out = '';
  let cursor = 0;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const [matchStr, tag] = m;
    const openStart = m.index;
    const innerStart = openStart + matchStr.length;
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
    // Keep the open + close, neutralise inner.
    out += html.slice(openStart, innerStart) + ' ' + html.slice(innerEnd, closeEnd);
    cursor = closeEnd;
    openRe.lastIndex = closeEnd;
  }
  out += html.slice(cursor);
  return out;
}

// Scan for leaf-tag text without data-i18n. Strips <script>/<style>/<svg>/<defs>
// blocks and any data-i18n-covered subtrees first, then walks remaining tags.
function scanUntagged(html) {
  let cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '');
  cleaned = maskI18nCovered(cleaned);

  const findings = [];
  // Match opening tag, capture inner text up to closing tag; non-nested only.
  const tagRe = /<([a-z][a-z0-9]*)\b([^>]*)>([^<]*)<\/\1>/gi;
  let m;
  while ((m = tagRe.exec(cleaned)) !== null) {
    const [, tag, attrs, inner] = m;
    if (!LEAF_TAGS.has(tag.toLowerCase())) continue;
    if (/\bdata-i18n=/.test(attrs)) continue;
    // Skip the lang option labels — those are intentional language markers
    if (tag.toLowerCase() === 'option') continue;
    // Skip aria-hidden tags (decorative)
    if (/\baria-hidden="true"/.test(attrs)) continue;

    const text = inner.replace(/&\w+;/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length < 2) continue;

    let allowed = false;
    for (const re of STAY_EN_PATTERNS) {
      if (re.test(text)) { allowed = true; break; }
    }
    if (allowed) continue;

    // Skip non-letter content (>50% non-letter chars suggests data, not copy)
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    if (letters < 2) continue;

    findings.push({ tag, text: text.slice(0, 120) });
  }
  return findings;
}

function main() {
  let problems = 0;

  console.log('=== Pass 1: data-i18n key parity ===\n');
  for (const file of SOURCES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      console.warn(`MISSING source: ${file}`);
      continue;
    }
    const html = readFileSync(path, 'utf8');
    const keys = extractI18nKeys(html);
    const unique = Array.from(new Set(keys));
    console.log(`[${file}] ${unique.length} keys`);

    for (const slug of SLUGS) {
      const dict = loadDict(slug);
      if (!dict) {
        console.log(`  [${slug}] dict missing`);
        problems++;
        continue;
      }
      const missing = unique.filter((k) => !(k in dict));
      if (missing.length === 0) {
        console.log(`  [${slug}] OK`);
      } else {
        console.log(`  [${slug}] MISSING ${missing.length} key(s):`);
        for (const k of missing.slice(0, 8)) console.log(`    - ${k}`);
        if (missing.length > 8) console.log(`    … +${missing.length - 8} more`);
        problems += missing.length;
      }
    }
    console.log('');
  }

  console.log('=== Pass 2: untagged English text in source HTML ===\n');
  for (const file of SOURCES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, 'utf8');
    const findings = scanUntagged(html);
    console.log(`[${file}] ${findings.length} candidate(s) without data-i18n`);
    for (const f of findings.slice(0, 30)) {
      console.log(`  <${f.tag}> "${f.text}"`);
    }
    if (findings.length > 30) console.log(`  … +${findings.length - 30} more`);
    console.log('');
    if (findings.length > 0) problems += findings.length;
  }

  if (problems === 0) {
    console.log('All checks passed.');
  } else {
    console.log(`\n${problems} potential issue(s). Review and add data-i18n / dict entries as needed.`);
  }
}

main();
