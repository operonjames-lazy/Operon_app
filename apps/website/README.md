# Operon marketing site

Static flat-file website for `operon.network`. Source of truth: `hero-prototype-O*.html`. The legacy React app at `App.tsx` and `components/` is **reference-only** — do not edit.

## Layout

```
apps/website/
├── hero-prototype-O.html         EN home (source of truth)
├── hero-prototype-O-agents.html  EN agents page
├── hero-prototype-O-nodes.html   EN nodes page
├── hero-prototype-O-faq.html     EN + 6 inline lang blocks (FAQ source)
├── proto-o-i18n.js               Client router — browser-detect + URL switcher
├── index.html                    GENERATED — copy of hero-prototype-O.html
├── i18n/
│   ├── en.json                   421 keys (merged from en.{home,agents,nodes}.json)
│   └── {zh-cn,zh-tw,ko,ja,th,vi}.json
├── scripts/
│   └── build-i18n.mjs            Build per-language dirs from EN HTML + dicts
├── {zh-cn,zh-tw,ko,ja,th,vi}/    GENERATED — per-language copies
├── public/                       Static assets (faq/, quill/, zenith/, etc.)
├── App.tsx, components/          LEGACY React app, reference-only
└── index-react-legacy.html       Backup of pre-prototype-O index.html
```

## Run locally

```
pnpm install
pnpm dev            # vite serves apps/website at http://localhost:3000/
```

Vite serves whatever `index.html` is at the root, plus all flat HTML files and the lang dirs. No build step needed for the React app to be visible — but it's no longer the default. The React app stays accessible at `index-react-legacy.html` or by reverting `index.html` to the React entry.

## Edit copy

1. Edit the EN string in the relevant `hero-prototype-O*.html`. Each translatable element is tagged with `data-i18n="page.section.field"`.
2. Update `i18n/en.json` for the matching key (or rebuild it from the per-page shards `en.{home,agents,nodes}.json`).
3. Update the 6 non-EN dicts (`zh-cn.json`, `zh-tw.json`, `ko.json`, `ja.json`, `th.json`, `vi.json`) for the affected keys. For non-trivial changes, run the translator skill (`/translation`).
4. Rebuild:
   ```
   node scripts/build-i18n.mjs
   ```
5. Refresh `/` and the lang dirs to verify.

## Add a new page

1. Create `hero-prototype-O-<page>.html` alongside the existing prototypes — flat HTML, dark hex-grid CSS aesthetic (copy variables from an existing prototype).
2. Tag translatable text with `data-i18n="<page>.<section>.<field>"`.
3. Add the keys to `i18n/en.json` and translate to the 6 other langs.
4. Add the file to `DICT_FILES` in `scripts/build-i18n.mjs`.
5. Wire cross-page nav: add a tab to `nav-mid` in all sibling prototypes (`hero-prototype-O.html`, `-agents.html`, `-nodes.html`, `-faq.html`).
6. Use **relative filenames** for cross-page links (`href="hero-prototype-O-<other>.html"`). Never `/`-prefixed paths — they'd hit vite's SPA fallback or break inside `<lang>/` dirs.

## Conventions

- `data-i18n` only on **leaf** text-bearing elements (h1/h2/p/a/span/button). Translation values may contain inline HTML (`<span class="ice">…</span>`).
- Pure-data keys (chain names, brand wordmark, OPN-XXX codes, agent names, dollar amounts, dates) output verbatim across all languages.
- Locked terminology lives in `~/Downloads/Operon_Master_Context_v34.md` §10. Use it for any new translation work.
- Forbidden phrases: passive income, to the moon, guaranteed returns, paradigm (in marketing register), revolutionary, game-changing.

## App connection

CTAs point to `https://app.operon.network`:
- "Launch App" / "Get started" → `/?connect=1`
- "Buy a node" → `/sale`

To override for local dev, search-replace `https://app.operon.network` in the 3 EN HTML files and re-run the build.

## i18n details

See [reference_i18n_pipeline.md in `~/.claude/projects/.../memory/`](../../.claude/projects/c--Users-james-Documents-Operon-App/memory/reference_i18n_pipeline.md) for full pipeline documentation including build script behavior, lang detection rules, and the FAQ extraction logic.
