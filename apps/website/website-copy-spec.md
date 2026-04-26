# Website Copy — Spec

Working spec for `operon.network` marketing site copy. Source of truth: `~/Downloads/Operon_Master_Context_v34.md`.

The site is the **prototype-O flat-file ecosystem** at [apps/website/hero-prototype-O*.html](apps/website/). The legacy React app at [App.tsx](apps/website/App.tsx) is **reference-only** and not deployed.

---

## Principles (read before editing)

1. **v34 is canonical.** When editorial instinct conflicts with v34, defer to v34.
2. **Locked vocabulary** (v34 §10): use exact approved terms. Do not paraphrase.
   - Use: *"referral cascade"*, *"Activity Pool"*, *"Agent Reputation Directory"*, *"CAC redistribution"*, *"hard cap"*, *"on-chain"*
   - Avoid: *"passive income"*, *"earn while you sleep"*, *"to the moon"*, *"revolutionary"*, *"game-changing"*, *"paradigm"*, *"leverage"* as a verb, exclamation marks in formal content.
3. **Prohibitions** (v34 §10/§12) — never publish:
   - Specific TGE dates until officially announced
   - Fixed APY or yield percentages
   - ETH or BNB as payment methods (USDC/USDT only — both Arbitrum and BNB Smart Chain)
   - Specific Elite Partner commission rates
   - "Guaranteed returns" framing
4. **Trust model truth** (v34 §7): live verification at TGE = multi-node Protocol Compliance Attestation. **Not** TEE — TEE is Layer 4, future-roadmap, *not committed*. Do not claim TEE-as-live.
5. **Modern protocol register, not 2017 ICO playbook.** No roadmap timelines on the home page. No competitor tables. No "trusted by" logos. Credibility = onchain proof (contract addresses, live numbers, working agent showcases), not marketing claims.

---

## Architecture

The site lives in 4 EN source files plus 6 generated language dirs:

```
hero-prototype-O.html           Home    (3300 lines, hex-grid hero, 3 primitives, node card, etc.)
hero-prototype-O-agents.html    Agents  (1200 lines, featured Quill, 6 consumer agents, 12 protocol services)
hero-prototype-O-nodes.html    Nodes   (1370 lines, license card, 4 functions, 3 reward streams, 40 tiers, FAQ)
hero-prototype-O-faq.html       FAQ     (3650 lines, multi-lang via inline data-lang blocks)
{zh-cn,zh-tw,ko,ja,th,vi}/      Generated per-lang copies
```

Strings are tagged with `data-i18n="page.section.field"` on leaf elements; `i18n/en.json` is the EN dict (421 keys); `scripts/build-i18n.mjs` applies non-EN dicts and writes per-language dirs. See [README.md](apps/website/README.md) for the full build pipeline.

---

## Status of v34 alignment

### Already applied (live)

#### Hero + architecture
- `nav.protocol` label, `archBadge: "The Protocol"`, `archTitle: "Open rails for the agent economy"`, `archDesc: "Foundation models reason. Agents act. Operon is the protocol they run on..."`

#### Home FAQ (mini, 4 questions)
- `faq1A` uses "Open rails for the agent economy", not "Layer 2 of the AI stack"
- `faq2A` mentions both Arbitrum AND BNB Smart Chain
- `faq3A` adds: *"Nodes attest, meter, route, and serve registry queries at the protocol layer — no inference required."*
- `faq4A` uses v34 phrasing: *"on-chain referral attribution"* (the locked phrase "5-level on-chain referral cascade" lives in the canonical /faq/ page; the home teaser keeps it brief)
- "See full FAQ →" link below mini-FAQ pointing to `hero-prototype-O-faq.html`

#### FAQ media-library style page (full FAQ)
- Restyled from light theme → dark hex-grid aesthetic to match the rest of prototype-O
- Stripped *"Layer 2 of the AI stack"* framing
- TEE language replaced with multi-node attestation: *"Agent outputs are attested by a randomly selected subset of nodes per challenge — the multi-node attestation is recorded on-chain."*

#### Node sale page
- `np_heroLine4`: "POWER THE AI AGENT ECONOMY." (v34 §10 approved tagline)
- `np_heroDescBold`: "Hard-capped at 100,000 nodes / 42B $OPRN. No mint authority. Verifiable on Arbiscan."
- `np_date`: "ARBITRUM · BNB SMART CHAIN" (no Q1 2026 date — v34 §10 prohibits)
- `np_payCurrencies`: "USDC · USDT" (no ETH/BNB)
- `nodeYield`: "Activity Pool Share" (no fixed yield %)
- `techDesc1`: "USDC or USDT. Tier 1 starts at $500. ERC-721 on Arbitrum or BNB Smart Chain (buyer chooses)."

#### Why now
- `whyDesc`: "Agentic AI projected to exceed $100B by 2030. Half of enterprises using generative AI plan to deploy agentic systems within two years..."

#### Translations (all 6 non-EN langs, 421/421 keys each)
- zh-cn, zh-tw, ko, ja, th, vi all translated and prose-audited
- Locked terminology (v34 §10) applied: AI 智能体 (NEVER 代理), 节点, 协调层, 分发引擎, 活动池, 硬性上限, 链上, 智能合约, 归因, 连锁
- Forbidden terms absent across all langs

#### App connection
- "Launch App" → `https://app.operon.network/?connect=1`
- "Get started" → `https://app.operon.network/?connect=1`
- "Buy a node" → `https://app.operon.network/sale`
- "Try Quill" / "View demo" → `/quill/`, `/zenith/` (existing static demos)

### Pending

1. **Contract addresses footer** — when sale + token contracts deploy, add to footer:
   ```
   Sale contract:    0x... · arbiscan.io/address/0x...
   $OPRN (Arbitrum): 0x... · arbiscan.io/token/0x...
   $OPRN (BSC):      0x... · bscscan.com/token/0x...
   ```
   Goes in `<footer>` of each prototype-O*.html. Highest-leverage credibility add.

2. **Agent brief pages** — "Read brief" CTAs on opn203/204/205/206 currently `href="#"`. Pages don't exist yet.

3. **Pitch deck link** — "Read the deck" CTAs (home final, agents final) currently `href="#"`. Deck not deployed.

4. **Footer link targets** — Workflows / Attestations / Mainnet / Validators / Chains / Status / Docs / Press all point to `#` because endpoints don't exist yet.

5. **Zenith showcase data** — [operon.network/zenith/](https://operon.network/zenith/) renders performance metrics as `—` (blank). Live trading page with no live numbers reads as vapor. Fix is on the Zenith page itself, separate from this repo's home-page copy.

---

## Do NOT do (rejected approaches)

- **No phase 1-5 roadmap section on home.** 2017 ICO pattern. Roadmaps in crypto are liabilities the moment a date slips. Let docs/whitepaper carry phasing.
- **No competitor comparison table.** "We're not Bittensor because X" reads as defensive. Strong projects assert; they don't position-against. v34 §11's competitor table is *internal positioning*, not website material.
- **No expanding the home mini-FAQ with Forge / Activity Pool entries.** The canonical full FAQ at `hero-prototype-O-faq.html` already covers them. Home mini-FAQ stays at 4 questions as a teaser.
- **No "Live today. 100,000 nodes." style proof line in hero.** Network isn't running yet — overclaim. Pre-deployed credibility comes from contract addresses + working agent showcases, not headline numbers.
- **No editing of [App.tsx](apps/website/App.tsx) or [components/](apps/website/components/).** Reference-only. The website ships the prototype-O flat-file ecosystem, not the React SPA.

---

## Reference: high-frequency v34 facts

For quick lookup when writing copy.

| Fact | v34 Value |
|---|---|
| Total nodes | 100,000 (hard-capped permanently, 40 tiers × 2,500 each) |
| Tier 1 price | $500 |
| Tier 40 price | $3,354 |
| Total token supply | 42,000,000,000 $OPRN (fixed, no mint authority) |
| Chains | Arbitrum + BNB Smart Chain (ERC-721 nodes / ERC-20 token) |
| Payment methods | USDC or USDT only — both chains |
| Transfer lock | 6 months post-purchase |
| Emission schedule | 40 / 30 / 20 / 10 % over 4 years |
| Performance threshold | >99% uptime from Q5 (Q1–Q4 grace period) |
| Referral structure | L1 10% / L2 3% / L3 2% / L4 1% / L5 1% — unified, 5-level |
| Pre-TGE referral payment | USDC, biweekly |
| Post-TGE referral payment | $OPRN from Referral & Distribution Pool |
| Sale termination | Open-ended; pauses ahead of TGE |
| Approved primary tagline | "Own a node. Power the AI agent economy. Earn as the network grows." |

---

*Spec last updated: 2026-04-26 (session 3 — prototype-O migration + 7-language pipeline). Source: Operon_Master_Context_v34.md.*
