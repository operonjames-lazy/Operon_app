import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface FAQPageProps {
  t: any;
}

const FAQPage: React.FC<FAQPageProps> = ({ t }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sections = [
    { id: 'basics', label: 'Node Basics' },
    { id: 'sale', label: 'Sale Structure' },
    { id: 'unsold', label: 'Unsold Nodes & Burn' },
    { id: 'roi', label: 'Earnings & ROI' },
    { id: 'transfer', label: 'Transferability' },
    { id: 'referral', label: 'Referral Network' },
    { id: 'token', label: 'Token & Treasury' },
    { id: 'products', label: 'Products' },
    { id: 'risk', label: 'Risk & Regulatory' },
  ];

  return (
    <div className="pt-24 pb-20 px-6 min-h-screen bg-[#050505] text-white font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-6">
            <span>Genesis Node Sale · FAQ</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter mb-6">
            Everything you need<br/>to know about <span className="text-[#00f2ff]">Operon.</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Operon is the open agent protocol — Layer 2 of the AI stack. The Genesis Node Sale opens the protocol to its first 100,000 operators. This page answers every material question about the sale, tokenomics, referral mechanics, and earning potential.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16 border-y border-white/10 py-8">
          {[
            { val: '100,000', label: 'Total Nodes · Hard Cap' },
            { val: '$500', label: 'Tier 1 Entry Price' },
            { val: '40', label: 'Pricing Tiers' },
            { val: '42B', label: '$OPRN Fixed Supply' },
            { val: '25%', label: 'Allocated to Operators' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-black text-white mb-1">{stat.val}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-xl mx-auto mb-16">
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 pl-12 text-white placeholder-gray-500 focus:outline-none focus:border-[#00f2ff]/50 transition-colors"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">⌕</span>
        </div>

        {/* Content Sections */}
        <div className="space-y-16">
          
          {/* 1. Node Basics */}
          <Section id="basics" title="Node Basics" count="3 questions" icon="⬡">
            <FAQItem q="What is an Operon Node?">
              <p className="mb-4">An Operon Node is a permanent <span className="text-[#00f2ff]">ERC-721 NFT licence</span> issued on Arbitrum. In its current form, it grants distribution rights within the Operon ecosystem: base <span className="text-[#00f2ff]">$OPRN</span> emissions, performance bonuses, a share of the Activity Pool, and participation in the Community Referral Network. The licence also carries governance voting rights as the protocol matures.</p>
              <p className="mb-4">On the roadmap, Operon nodes are designed to evolve into validator nodes. In Operon's context, validation means <em>lightweight coordination validation</em> — confirming agent task completion, attesting to service quality metrics, verifying uptime and output consistency across the agent network, and contributing to on-chain reputation scoring. This validation role is additive: it does not require new hardware.</p>
              <Callout title="Hard Cap">
                The supply is permanently fixed at 100,000. No additional nodes will ever be minted under any circumstance.
              </Callout>
            </FAQItem>
            <FAQItem q="What hardware do I need to run a node?">
              <p className="mb-4">No GPU, server rack, or enterprise-grade hardware is required. Operon Nodes are lightweight participation and coordination units — not compute farms. The node client is designed to run on standard consumer hardware: a laptop or modest VPS is sufficient.</p>
              <p>Node-as-a-Service (NaaS) providers will be available at TGE for holders who prefer fully managed operation with zero local setup.</p>
            </FAQItem>
            <FAQItem q="Are nodes NFTs? What does owning one actually mean?">
              <p className="mb-4">Yes. Each Operon Node is issued as an <span className="text-[#00f2ff]">ERC-721</span> NFT on Arbitrum. The NFT <em>is</em> the licence — your emission rights, distribution benefits, governance stake, and future validator participation are all tied to that token.</p>
              <p>Purchasing a node means owning the NFT. Running the node client (or delegating to a NaaS provider) activates its earning and participation functions.</p>
            </FAQItem>
          </Section>

          {/* 2. Sale Structure */}
          <Section id="sale" title="Sale Structure" count="5 questions" icon="◈">
            <FAQItem q="How does the node pricing work?">
              <p className="mb-4">The Genesis Node Sale runs across <span className="text-[#00f2ff]">40 tiers</span> of <span className="text-[#00f2ff]">2,500 nodes</span> each. Each tier is priced exactly <span className="text-[#00f2ff]">5%</span> above the previous, starting at <span className="text-[#00f2ff]">$500.00</span> for Tier 1 and reaching approximately <span className="text-[#00f2ff]">$3,354</span> at Tier 40. Tiers open automatically as previous tiers sell out — no manual intervention, no downtime between tiers.</p>
              <p>A complete sell-out yields approximately <strong>$151 million gross</strong>. The sale closes when all 100,000 nodes are sold, or on the published close date — whichever comes first.</p>
            </FAQItem>
            <FAQItem q="What payment currencies are accepted?">
              <p className="mb-4">The node sale accepts three currencies:</p>
              <Table headers={['Currency', 'Chain', 'Notes']}>
                <tr><td className="text-[#00f2ff]">ETH</td><td>Arbitrum</td><td>Rate locked 72h before sale opens</td></tr>
                <tr><td className="text-[#00f2ff]">BNB</td><td>BNB Chain (native)</td><td>Rate locked 72h before sale opens</td></tr>
                <tr><td className="text-[#00f2ff]">USDC / USDT</td><td>Arbitrum</td><td>Settled at face value, no conversion</td></tr>
              </Table>
              <p className="mt-4">All pricing is denominated in USD. For ETH and BNB, the conversion rate is locked 72 hours before the sale opens and held constant for the full duration, eliminating buyer exposure to intra-sale price volatility. Nodes are minted on Arbitrum upon payment confirmation regardless of which currency is used.</p>
            </FAQItem>
            <FAQItem q="Is there a per-wallet purchase cap?">
              <p className="mb-4">Yes — for early tiers only. <span className="text-[#00f2ff]">Tiers 1–5</span> carry per-wallet purchase limits to protect decentralisation and ensure broad community access at the lowest price points. This is the same model used by Aethir's node sale.</p>
              <p><span className="text-[#00f2ff]">Tiers 6–40</span> have no per-wallet cap; participants may purchase as many nodes as they choose. Specific early-tier limits will be published in the official sale terms at operon.network prior to launch.</p>
            </FAQItem>
            <FAQItem q="What is the whitelist, and how do I qualify?">
              <p className="mb-4">Tiers 1–5 each reserve <strong>50% of their nodes</strong> (1,250 per tier, 6,250 total) for whitelist participants across five categories:</p>
              <Table headers={['Category', 'Description']}>
                <tr><td>OG Community</td><td>Discord / Telegram members, waitlist pre-registrants, testnet participants</td></tr>
                <tr><td>Strategic Partner DAOs</td><td>Web3 and AI-native DAO communities with fixed allocations</td></tr>
                <tr><td>KOLs & Ambassadors</td><td>Creators with 50k+ documented reach, minimum 2 pre-sale deliverables</td></tr>
                <tr><td>VC & Institutional</td><td>Early-stage investors and strategic institutional participants</td></tr>
                <tr><td>Quest & Campaign Winners</td><td>Galxe and Layer3 quest participants with verifiable on-chain activity</td></tr>
              </Table>
              <p className="mt-4">The remaining 50% of Tier 1–5 and all of Tiers 6–40 are public, first-come-first-served. Pre-registering at <strong>operon.network</strong> is the primary path to OG whitelist consideration.</p>
            </FAQItem>
            <FAQItem q="What happens when a tier sells out?">
              <p className="mb-4">When 2,500 nodes have been sold in a given tier, that tier closes automatically via smart contract and the next opens at the new price — no manual intervention, no pause. Buyers are always purchasing at the current open tier's price.</p>
              <p>If you are mid-transaction when a tier closes, the smart contract will complete your purchase at the next available tier price if that price is within your approved transaction parameters, or return your funds if not.</p>
            </FAQItem>
          </Section>

          {/* 3. Unsold Nodes */}
          <Section id="unsold" title="Unsold Nodes & Burn Mechanics" count="2 questions" icon="🔥">
            <FAQItem q="What happens to unsold nodes at the end of the sale?">
              <p className="mb-4">All unsold node licences are <strong>permanently burned</strong>. The $OPRN emission allocation originally designated for those nodes is <strong>redistributed proportionally to all node holders who purchased</strong> — before TGE, before any emissions begin.</p>
              <Callout title="Every Unsold Node Burns → Every Buyer's Allocation Grows" gold>
                The total emission pool allocated to nodes never changes. Only the number of nodes sharing it does. Partial sell-through does not disadvantage early buyers — it rewards them.
              </Callout>
              <Table headers={['Sell-Out %', 'Nodes Sold', 'Nodes Burned', 'Base $OPRN per Node']}>
                <tr><td>100%</td><td>100,000</td><td>0</td><td className="font-mono">63,000 $OPRN</td></tr>
                <tr><td>80%</td><td>80,000</td><td>20,000</td><td className="font-mono">78,750 $OPRN</td></tr>
                <tr><td>60%</td><td>60,000</td><td>40,000</td><td className="font-mono">105,000 $OPRN</td></tr>
                <tr><td>50%</td><td>50,000</td><td>50,000</td><td className="font-mono">126,000 $OPRN</td></tr>
                <tr className="bg-white/5 font-bold"><td>Formula</td><td colSpan={2}>6.3B ÷ Nodes Sold</td><td className="font-mono">= $OPRN per node</td></tr>
              </Table>
              <p className="mt-4">Unsold burns are processed during the window between sale close and TGE. All redistribution is on-chain and verifiable before emissions begin.</p>
            </FAQItem>
            <FAQItem q="When do emissions start, and do all nodes start at the same time?">
              <p className="mb-4">Yes — all nodes begin earning <strong>simultaneously at TGE</strong>, regardless of which tier or which day within the sale they were purchased. The sale closes fully before TGE opens. There is no concurrent sale-and-emission period.</p>
              <p>TGE occurs a <span className="text-[#00f2ff]">minimum of 4 weeks</span> and a <span className="text-[#00f2ff]">maximum of 12 weeks</span> after sale close, allowing time for burn-and-redistribute processing, exchange listing preparation, and the community quest campaign. Every node holder enters the emission schedule at exactly the same moment.</p>
            </FAQItem>
          </Section>

          {/* 4. Earnings & ROI */}
          <Section id="roi" title="Earnings & ROI Framework" count="3 questions" icon="◎">
            <FAQItem q="How many $OPRN tokens does each node earn — year by year?">
              <p className="mb-4">The base emission pool is <span className="text-[#00f2ff]">6,300,000,000 $OPRN</span> (15% of total supply) distributed across the node operator base over four years via a front-weighted decay schedule. At full sell-out (100,000 nodes), each node's entitlement is <strong>63,000 $OPRN</strong> — but this increases proportionally if nodes go unsold and are burned.</p>
              <Table headers={['Year', '% of Base Pool', 'Tokens / Node*', 'Daily Rate / Node*', 'Cumulative*']}>
                <tr><td><strong>Year 1</strong></td><td>40%</td><td className="font-mono">25,200 $OPRN</td><td className="font-mono">~69.04 / day</td><td>25,200</td></tr>
                <tr><td><strong>Year 2</strong></td><td>30%</td><td className="font-mono">18,900 $OPRN</td><td className="font-mono">~51.78 / day</td><td>44,100</td></tr>
                <tr><td><strong>Year 3</strong></td><td>20%</td><td className="font-mono">12,600 $OPRN</td><td className="font-mono">~34.52 / day</td><td>56,700</td></tr>
                <tr><td><strong>Year 4</strong></td><td>10%</td><td className="font-mono">6,300 $OPRN</td><td className="font-mono">~17.26 / day</td><td>63,000</td></tr>
                <tr className="bg-white/5 font-bold"><td><strong>Total</strong></td><td>100%</td><td className="font-mono"><strong>63,000 $OPRN</strong></td><td className="font-mono">—</td><td><strong>63,000</strong></td></tr>
              </Table>
              <p className="mt-2 text-xs text-gray-500">* At full sell-out (100,000 nodes). At 80% sell-out: 78,750 $OPRN per node. At 50% sell-out: 126,000 $OPRN per node.</p>
            </FAQItem>
            <FAQItem q="What are the Performance Bonus and Activity Pool?">
              <p className="mb-4"><strong>Performance Bonus</strong> — A separate pool of <span className="text-[#00f2ff]">4,200,000,000 $OPRN</span> (10% of total supply) distributed quarterly to nodes maintaining <span className="text-[#00f2ff]">&gt;99% uptime</span>. Quarters 1–4 (the first 12 months post-TGE) are a grace period in which all active nodes qualify. From Quarter 5 onwards, only nodes meeting the uptime threshold receive the bonus. At full sell-out and 100% participation, this is approximately <strong>3,500 $OPRN per qualifying node per quarter</strong> — but the fewer nodes that qualify, the larger each qualifying node's share.</p>
              <p className="mb-4"><strong>Activity Pool</strong> — A variable pool funded by real usage fees from Operon Forge and all protocol activity. Distributions occur daily in proportion to each node's validated uptime in that 24-hour epoch. This pool grows as agent adoption grows, and is designed to become the primary driver of operator returns over time — replacing fixed emissions as the network matures.</p>
              <Callout title="Three Income Streams">
                Base emissions (fixed, predictable) + Performance bonus (conditional on uptime) + Activity Pool (variable, scales with usage). Together these give node operators both a guaranteed floor and unlimited upside.
              </Callout>
            </FAQItem>
            <FAQItem q="What is the illustrative breakeven for a Tier 1 node?">
              <div className="bg-white/5 rounded-xl p-6 font-mono text-sm text-gray-300 mb-4">
                <div className="text-[10px] uppercase tracking-widest text-[#00f2ff] mb-4 font-sans font-bold">Tier 1 Node — Full Sell-Out Scenario</div>
                <div className="flex justify-between mb-2"><span>Purchase price</span><span>$500.00</span></div>
                <div className="flex justify-between mb-2"><span>Base emission entitlement (4yr)</span><span>63,000 $OPRN</span></div>
                <div className="flex justify-between mb-4"><span>Perf. bonus entitlement (est.)</span><span>~42,000 $OPRN</span></div>
                <hr className="border-white/10 mb-4"/>
                <div className="flex justify-between mb-2"><span>Breakeven on base only</span><span>$0.008 / $OPRN (~$330M FDV)</span></div>
                <div className="flex justify-between mb-4"><span>Breakeven incl. perf. bonus</span><span>$0.005 / $OPRN (~$210M FDV)</span></div>
                <hr className="border-white/10 mb-4"/>
                <div className="flex justify-between text-[#00f2ff] font-bold"><span>Activity Pool distributions</span><span>Additional upside</span></div>
              </div>
              <p className="text-xs text-gray-500">At 80% sell-out (20,000 nodes burned), the same Tier 1 buyer receives 78,750 base $OPRN. Breakeven FDV drops to ~$270M on base emissions alone. This framework uses token-count arithmetic only and does not constitute a projection of $OPRN market price. Actual returns depend on network adoption, token market conditions, and operator uptime.</p>
            </FAQItem>
          </Section>

          {/* 5. Transferability */}
          <Section id="transfer" title="Transferability & Emissions Rights" count="2 questions" icon="⇄">
            <FAQItem q="Can I transfer or sell my node after purchase?">
              <p className="mb-4">Nodes are <span className="text-[#00f2ff]">non-transferable for 6 months</span> from date of purchase. This lock period establishes a stable, committed operator base from launch and discourages short-term speculative flipping. After the six-month lock expires, nodes are freely transferable on secondary markets.</p>
              <p className="mb-4">Important: <strong>emission rights are tied to the original purchasing wallet</strong>, not the NFT itself. The rules are:</p>
              <Table headers={['Transfer timing', 'Emission treatment for new holder']}>
                <tr><td>Within lock period (first 6 months)</td><td>No emissions until lock expires; then earns from that point</td></tr>
                <tr><td>After lock period</td><td>Earns from point of transfer onwards; no back-emissions</td></tr>
                <tr><td>Original holder — no transfer</td><td>Earns from TGE onwards with no penalty of any kind</td></tr>
              </Table>
            </FAQItem>
            <FAQItem q="Are emissions fixed or can they change?">
              <p className="mb-4">The total $OPRN supply is <strong>permanently fixed at 42,000,000,000 tokens</strong>. No new tokens will ever be minted beyond this cap.</p>
              <p>However, distribution mechanics — how emissions are scheduled, allocated across pools, and gated by performance thresholds — may be adjusted through on-chain governance in future upgrades. Any such changes require on-chain governance approval and will be communicated transparently to all node holders in advance.</p>
            </FAQItem>
          </Section>

          {/* 6. Referral Network */}
          <Section id="referral" title="Community Referral Network" count="4 questions" icon="⊕">
            <FAQItem q="How does the pre-TGE referral structure work?">
              <p className="mb-4">Every node purchase automatically activates a referral code — <strong>your wallet address is your code</strong>. No application, no sign-up, no tiers to qualify for. The referral engine is on by default for every buyer, enforced by smart contract.</p>
              <Table headers={['Component', 'Who Benefits', 'Rate', 'Payment']}>
                <tr><td>Buyer Discount</td><td>Every node purchaser</td><td className="font-mono">10% off</td><td>At checkout, on-chain</td></tr>
                <tr><td>L1 Commission</td><td>Referrer whose code was used</td><td className="font-mono">10%</td><td>ETH / USDC within 14 days</td></tr>
                <tr><td>L2 Recruiter Bonus</td><td>Wallet that recruited the L1</td><td className="font-mono">3%</td><td>ETH / USDC within 14 days</td></tr>
                <tr><td>L3 Network Override</td><td>Wallet that recruited the L2</td><td className="font-mono">2%</td><td>ETH / USDC within 14 days</td></tr>
                <tr><td>L4 Network Override</td><td>Wallet that recruited the L3</td><td className="font-mono">1%</td><td>ETH / USDC within 14 days</td></tr>
                <tr><td>L5 Network Override</td><td>Wallet that recruited the L4</td><td className="font-mono">1%</td><td>ETH / USDC within 14 days</td></tr>
              </Table>
              <p className="mt-4">All five levels are paid in ETH / USDC within 14 days of sale close. Commissions are settled via a gas-efficient Merkle claim system. Merkle root published on-chain weekly. L2–L5 eligibility requires holding ≥1 active Operon Node.</p>
            </FAQItem>
            <FAQItem q="Why does Operon redistribute 27% of sale proceeds back to participants?">
              <p className="mb-4">This is a deliberate structural choice, not a promotion. Traditional software and crypto projects spend 20–40% of revenue on centralised marketing: agency fees, exchange listings, paid influencer campaigns, advertising. Operon redirects that spend directly to community members doing the same work with genuine alignment.</p>
              <Callout title="27% CAC Redistribution">
                For every $100M raised: $10M in buyer discounts · $10M in L1 commissions · $3M in L2 bonuses · $2M in L3 overrides · $1M in L4 overrides · $1M in L5 overrides. $73M flows to the treasury for development, grants, and operations.
              </Callout>
              <p className="mt-4">Every person who purchases a node and shares their referral code is converting their own network into a distribution channel for the protocol. The 27% figure represents customer acquisition cost restructured as decentralised ownership expansion.</p>
            </FAQItem>
            <FAQItem q="How do the post-TGE emission referral bonuses work?">
              <p className="mb-4">After TGE, the referral structure extends to five levels and shifts from purchase-based commissions to emissions-based pass-throughs. The key mechanic: the bonus is a percentage of the <em>earning node's base reward</em>, paid from the Referral Bonus Pool — never deducted from any other participant's rewards.</p>
              <div className="bg-white/5 rounded-xl p-6 font-mono text-sm text-gray-300 mb-4">
                <div className="text-[10px] uppercase tracking-widest text-[#00f2ff] mb-4 font-sans font-bold">Example — A referred node earns 100 $OPRN</div>
                <div className="flex justify-between mb-2"><span>L1 — Direct referrer</span><span>+10 $OPRN</span></div>
                <div className="flex justify-between mb-2"><span>L2 — Referrer of L1</span><span>+3 $OPRN</span></div>
                <div className="flex justify-between mb-2"><span>L3 — Referrer of L2</span><span>+2 $OPRN</span></div>
                <div className="flex justify-between mb-2"><span>L4 — Referrer of L3</span><span>+1 $OPRN</span></div>
                <div className="flex justify-between mb-4"><span>L5 — Referrer of L4</span><span>+1 $OPRN</span></div>
                <hr className="border-white/10 mb-4"/>
                <div className="flex justify-between text-[#00f2ff] font-bold"><span>Earning node receives</span><span>100 $OPRN (untouched)</span></div>
              </div>
              <p>All five bonuses are calculated against the same 100 $OPRN base — not compounded on each other. Eligibility requires maintaining <span className="text-[#00f2ff]">&gt;99% uptime</span> from Quarter 5 onwards. The Referral & Distribution Pool holds <span className="text-[#00f2ff]">4,200,000,000 $OPRN</span> (10% of total supply) — funding referral cascades, Elite Partner cascades, TGE quest rewards, and ongoing activity-based distribution.</p>
            </FAQItem>
            <FAQItem q="What is the Elite Partner Programme?">
              <p className="mb-4">A private, invitation-only programme for organisations, funds, and creators who bring significant communities, capital, or capabilities to Operon. Elite Partners receive:</p>
              <Table headers={['Benefit', 'Standard Buyer', 'Elite Partner']}>
                <tr><td>Buyer Rebate</td><td>10% at checkout</td><td>Enhanced (invitation-specific)</td></tr>
                <tr><td>L1 Commission</td><td>10%</td><td>Enhanced rate above 10%</td></tr>
                <tr><td>Co-Marketing</td><td>—</td><td>Full co-branding rights</td></tr>
                <tr><td>Whitelist Access</td><td>Standard</td><td>Priority for all future launches</td></tr>
                <tr><td>Ecosystem Role</td><td>Community member</td><td>Advisory seat, core team access</td></tr>
              </Table>
              <Callout title="Private & Invitation-Only" gold>
                The programme is not open to general applications and is not publicly listed. Eligible organisations are contacted through Operon's official channels.
              </Callout>
            </FAQItem>
          </Section>

          {/* 7. Token & Treasury */}
          <Section id="token" title="Token & Treasury" count="3 questions" icon="◉">
            <FAQItem q="What is $OPRN and when does it launch?">
              <p> $OPRN is the native protocol token of Operon Network, deployed as an <span className="text-[#00f2ff]">ERC-20 on Arbitrum</span>. Total fixed supply: <span className="text-[#00f2ff]">42,000,000,000 tokens</span> — no inflation, ever. $OPRN launches at TGE, which occurs between 4 and 12 weeks after node sale completion. Initial circulating supply at TGE is approximately <strong>3% of total supply (~1.26B $OPRN)</strong>. Node operators begin earning from the first emission period after TGE.</p>
            </FAQItem>
            <FAQItem q="Where does the 75% of sale proceeds go?">
              <p className="mb-4">Of every dollar raised, 25% returns directly to participants via discounts and referral commissions. The remaining <strong>75% flows to the protocol treasury</strong>, allocated across:</p>
              <Table headers={['Purpose', 'Detail']}>
                <tr><td>Protocol Development</td><td>Engineering, infrastructure, smart contract work</td></tr>
                <tr><td>Security Audits</td><td>Multiple independent audits before TGE, bug bounty programme</td></tr>
                <tr><td>Ecosystem Grants</td><td>Financial incentives for developers building on Operon</td></tr>
                <tr><td>Strategic Partnerships</td><td>Integration and growth partnerships</td></tr>
                <tr><td>Exchange Listings & Liquidity</td><td>Tier 2 CEX + DEX at TGE</td></tr>
              </Table>
              <p className="mt-4">Treasury allocations beyond initial liquidity are subject to DAO governance from Phase 3 (2027).</p>
            </FAQItem>
            <FAQItem q="What are the full tokenomics allocations?">
              <Table headers={['Allocation', '%', 'Tokens', 'Vesting']}>
                <tr><td>Node Base Rewards</td><td className="font-mono">15%</td><td className="font-mono">6,300,000,000</td><td>4-year decay emission (40/30/20/10%)</td></tr>
                <tr><td>Node Performance Bonus</td><td className="font-mono">10%</td><td className="font-mono">4,200,000,000</td><td>Quarterly · &gt;99% uptime from Q5</td></tr>
                <tr><td>Referral & Distribution Pool</td><td className="font-mono">10%</td><td className="font-mono">4,200,000,000</td><td>Referral cascades, quests & activity-based distribution</td></tr>
                <tr><td>Ecosystem & Dev Grants</td><td className="font-mono">15%</td><td className="font-mono">6,300,000,000</td><td>50% at 3mo post-TGE; 50% linear 24mo</td></tr>
                <tr><td>Core Team</td><td className="font-mono">24%</td><td className="font-mono">10,080,000,000</td><td>12mo lock · 36mo linear vest</td></tr>
                <tr><td>Early Investors</td><td className="font-mono">5%</td><td className="font-mono">2,100,000,000</td><td>12mo lock · 36mo linear vest</td></tr>
                <tr><td>Treasury / Liquidity</td><td className="font-mono">7%</td><td className="font-mono">2,940,000,000</td><td>2% at TGE for exchange liquidity · remainder DAO-controlled, 24mo lock</td></tr>
                <tr><td>Strategic Partners</td><td className="font-mono">5%</td><td className="font-mono">2,100,000,000</td><td>12mo lock · 36mo linear vest</td></tr>
                <tr><td>Advisors</td><td className="font-mono">4%</td><td className="font-mono">1,680,000,000</td><td>12mo lock · 36mo linear vest</td></tr>
                <tr><td>Reserve</td><td className="font-mono">5%</td><td className="font-mono">2,100,000,000</td><td>DAO-controlled · 24mo minimum lock</td></tr>
                <tr className="bg-white/5 font-bold"><td><strong>TOTAL</strong></td><td className="font-mono">100%</td><td className="font-mono">42,000,000,000</td><td>Fixed. No inflation ever.</td></tr>
              </Table>
            </FAQItem>
          </Section>

          {/* 8. Products */}
          <Section id="products" title="Products & Infrastructure" count="3 questions" icon="⬕">
            <FAQItem q="What is Operon Forge?">
              <p className="mb-4">Operon Forge is the protocol's consumer and developer marketplace for AI agents, launching simultaneously with TGE. For users: a curated catalogue of live, deployable AI agents across six categories — Trading & DeFi, Research & Data, Content Creation, Customer Service, Gaming & Entertainment, and Developer Tooling.</p>
              <p>For builders: immediate distribution to the Operon community and a monetisation channel. Usage fees from Forge flow into the Activity Pool for node operators, creating a direct feedback loop: more agent usage → more Activity Pool income → more operator returns.</p>
            </FAQItem>
            <FAQItem q="What is the Agent Reputation Directory?">
              <p className="mb-4">An on-chain, publicly queryable registry that aggregates verifiable performance data for every agent deployed on Operon: task completion rates, user ratings, uptime history, usage volume, and dispute records. Records are immutable and composable — any application can query the directory without relying on self-reported claims.</p>
              <p>The directory launches at TGE and forms the trust foundation for the Forge marketplace and any third-party application integrating Operon agents.</p>
            </FAQItem>
            <FAQItem q="Which blockchain does Operon run on?">
              <p className="mb-4">Operon is deployed on <strong>Arbitrum</strong> — a leading Ethereum Layer 2 offering low fees, high throughput, and deep EVM ecosystem connectivity. Node contracts, agent registries, referral tracking, reward distribution, and governance all run on Arbitrum.</p>
              <p>For the node sale: ETH and stablecoin payments are accepted on Arbitrum; BNB is received natively on BNB Chain. Nodes are minted on Arbitrum upon payment confirmation regardless of which chain the payment originates from.</p>
            </FAQItem>
          </Section>

          {/* 9. Risk */}
          <Section id="risk" title="Risk & Regulatory" count="2 questions" icon="⚑">
            <FAQItem q="Is node ownership a guarantee of profit?">
              <p className="mb-4"><strong>No.</strong> Node rewards depend on network growth, agent adoption, token market conditions, and the operator's own performance metrics. Emission schedules are predefined but the value of $OPRN is market-determined. The Activity Pool grows only if Forge and protocol usage grow.</p>
              <Callout title="Disclaimer" gold>
                Participation in the Operon node sale involves financial risk and no returns are guaranteed. This document is informational only and does not constitute investment advice. Investors should conduct their own due diligence.
              </Callout>
            </FAQItem>
            <FAQItem q="Is Operon available in the United States?">
              <p>US persons are excluded from the token component of the sale due to regulatory considerations. Specific geo-restrictions will be published in the official sale terms at <strong>operon.network</strong> prior to launch. Node NFT purchases may be available depending on jurisdiction; buyers are responsible for determining their own eligibility under applicable local law.</p>
            </FAQItem>
          </Section>

        </div>
      </div>
    </div>
  );
};

const Section = ({ id, title, count, icon, children }: any) => (
  <div id={id} className="scroll-mt-32">
    <div className="flex items-center gap-4 mb-8 pb-4 border-b-2 border-[#00f2ff]">
      <div className="w-9 h-9 bg-white/5 rounded-lg flex items-center justify-center text-[#00f2ff] text-lg">{icon}</div>
      <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">{title}</h2>
      <span className="ml-auto font-mono text-xs tracking-wider text-gray-500">{count}</span>
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

const FAQItem = ({ q, children }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isOpen ? 'border-[#00f2ff] bg-white/[0.02]' : 'border-white/10 bg-black'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-start gap-4 p-6 text-left"
      >
        <span className="flex-1 font-bold text-white pt-0.5">{q}</span>
        <span className={`w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-[10px] text-gray-400 transition-transform ${isOpen ? 'rotate-180 bg-[#00f2ff] border-[#00f2ff] text-black' : ''}`}>
          ▼
        </span>
      </button>
      <motion.div 
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6 pl-16 text-sm text-gray-400 leading-relaxed">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const Callout = ({ title, children, gold }: any) => (
  <div className={`border-l-2 rounded-r-lg p-4 my-4 text-sm ${gold ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]' : 'border-[#00f2ff] bg-[#00f2ff]/10 text-[#00f2ff]'}`}>
    <div className="font-mono text-[10px] uppercase tracking-widest font-bold mb-2 opacity-80">{title}</div>
    <div className="opacity-90">{children}</div>
  </div>
);

const Table = ({ headers, children }: any) => (
  <div className="overflow-x-auto my-4 rounded-lg border border-white/10">
    <table className="w-full text-sm text-left">
      <thead className="bg-white/5 text-[#00f2ff] font-bold text-xs uppercase tracking-wider">
        <tr>
          {headers.map((h: string) => <th key={h} className="px-4 py-3 border-b border-white/10">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10 text-gray-400">
        {children}
      </tbody>
    </table>
  </div>
);

export default FAQPage;
