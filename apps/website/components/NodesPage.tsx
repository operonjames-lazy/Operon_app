
import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface NodesPageProps {
  t: any;
}

const NodesPage: React.FC<NodesPageProps> = ({ t }) => {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.innerHTML = ''; // Clear previous
      const minH = 15, maxH = 80;
      const prices = Array.from({length:40}, (_,i) => 500 * Math.pow(1.05, i));
      const minP = prices[0], maxP = prices[39];

      prices.forEach((price, i) => {
        const bar = document.createElement('div');
        // Styling handled by Tailwind classes below
        bar.className = `w-full rounded-sm relative cursor-default transition-all duration-150 hover:brightness-125 ${i < 5 ? 'bg-gradient-to-b from-[#F59E0B] to-[#F59E0B]/40' : 'bg-gradient-to-b from-[#60A5FA] to-[#1A56DB]/30'}`;
        const h = minH + ((price - minP) / (maxP - minP)) * (maxH - minH);
        bar.style.height = h + 'px';
        bar.title = `Tier ${i+1}: $${price.toFixed(2)}`;
        gridRef.current?.appendChild(bar);
      });
    }
  }, []);

  return (
    <div className="pt-32 pb-20 px-6 min-h-screen font-sans text-[#F8FAFF]">
      <div className="max-w-[1200px] mx-auto">

        {/* Top Bar - Simulated from design */}
        <div className="flex justify-between items-center mb-14 pb-6 border-b border-white/5">
          <div className="font-display text-2xl tracking-[0.15em]">OPERON <em className="text-[#60A5FA] not-italic">NETWORK</em></div>
          <div className="font-mono text-[11px] tracking-[0.15em] text-[#06B6D4] bg-[#06B6D4]/10 border border-[#06B6D4]/25 px-3.5 py-1.5 rounded">{t.np_badge}</div>
          <div className="font-mono text-[11px] tracking-[0.1em] text-[#5A6A82]">{t.np_date}</div>
        </div>

        {/* Hero */}
        <div className="mb-14">
          <div className="font-mono text-xs tracking-[0.2em] text-[#60A5FA] mb-3 uppercase">{t.np_statsLine}</div>
          <h1 className="font-display text-[88px] leading-[0.92] tracking-[0.02em] mb-2">
            <span className="text-[#60A5FA]">{t.np_heroLine1}</span> {t.np_heroLine2}<br/>
            <span className="text-[#5A6A82]">{t.np_heroLine3}</span><br/>
            {t.np_heroLine4}
          </h1>
          <p className="text-[17px] font-light text-[#5A6A82] leading-relaxed max-w-[600px] mt-5">
            {t.np_heroDesc}{' '}<strong className="text-[#F8FAFF] font-medium">{t.np_heroDescBold}</strong>
          </p>
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-5 gap-[2px] mb-12 bg-[#2A3548] rounded-xl overflow-hidden">
          <div className="bg-[#0A0F1C] p-6 text-center hover:bg-[#1A56DB]/10 transition-colors">
            <div className="font-display text-[40px] tracking-[0.03em] leading-none mb-1.5"><span className="text-[#60A5FA]">100</span>K</div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase leading-snug">{t.np_stat1a}<br/>{t.np_stat1b}</div>
          </div>
          <div className="bg-[#0A0F1C] p-6 text-center hover:bg-[#1A56DB]/10 transition-colors">
            <div className="font-display text-[40px] tracking-[0.03em] leading-none mb-1.5"><span className="text-[#F59E0B]">40</span></div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase leading-snug">{t.np_stat2a}<br/>{t.np_stat2b}</div>
          </div>
          <div className="bg-[#0A0F1C] p-6 text-center hover:bg-[#1A56DB]/10 transition-colors">
            <div className="font-display text-[40px] tracking-[0.03em] leading-none mb-1.5"><span className="text-[#06B6D4]">$500</span></div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase leading-snug">{t.np_stat3a}<br/>{t.np_stat3b}</div>
          </div>
          <div className="bg-[#0A0F1C] p-6 text-center hover:bg-[#1A56DB]/10 transition-colors">
            <div className="font-display text-[40px] tracking-[0.03em] leading-none mb-1.5"><span className="text-[#60A5FA]">5</span>%</div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase leading-snug">{t.np_stat4a}<br/>{t.np_stat4b}</div>
          </div>
          <div className="bg-[#0A0F1C] p-6 text-center hover:bg-[#1A56DB]/10 transition-colors">
            <div className="font-display text-[40px] tracking-[0.03em] leading-none mb-1.5">~<span className="text-[#10B981]">$151</span>M</div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase leading-snug">{t.np_stat5a}<br/>{t.np_stat5b}</div>
          </div>
        </div>

        {/* Tier Visualizer */}
        <div className="flex justify-between items-center mb-5">
          <div className="font-mono text-[11px] tracking-[0.2em] text-[#5A6A82] uppercase">{t.np_tierCurveTitle}</div>
          <div className="text-xs text-[#5A6A82]">{t.np_tierCurveDesc}</div>
        </div>

        <div className="grid gap-[3px] h-20 mb-4 items-end" style={{ gridTemplateColumns: 'repeat(40, 1fr)' }}>
          {Array.from({ length: 40 }).map((_, i) => {
            const price = 500 * Math.pow(1.05, i);
            const minH = 15;
            const maxH = 80;
            const minP = 500;
            const maxP = 500 * Math.pow(1.05, 39);
            const height = minH + ((price - minP) / (maxP - minP)) * (maxH - minH);

            return (
              <div
                key={i}
                className={`w-full rounded-sm relative cursor-default transition-all duration-150 hover:brightness-125 ${i < 5 ? 'bg-gradient-to-b from-[#F59E0B] to-[#F59E0B]/40' : 'bg-gradient-to-b from-[#60A5FA] to-[#1A56DB]/30'}`}
                style={{ height: `${height}px` }}
                title={`Tier ${i + 1}: $${price.toFixed(2)}`}
              />
            );
          })}
        </div>

        <div className="flex gap-6 items-center mb-9">
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#5A6A82] tracking-[0.08em]">
            <div className="w-3 h-3 rounded-[2px] bg-[#F59E0B]"></div>
            {t.np_legendWL}
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#5A6A82] tracking-[0.08em]">
            <div className="w-3 h-3 rounded-[2px] bg-[#60A5FA]"></div>
            {t.np_legendPublic}
          </div>
        </div>

        {/* Tier Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Early Tiers */}
          <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1A56DB]/10 border-b border-white/5 font-mono text-[10px] tracking-[0.15em] text-[#60A5FA] uppercase">{t.np_earlyTiersTitle}</div>
            <div className="grid grid-cols-[50px_1fr_1fr_1fr] px-5 py-2.5 bg-white/[0.02] border-b border-white/[0.03] font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase">
              <div>{t.np_colTier}</div><div>{t.np_colPrice}</div><div>{t.np_colRaise}</div><div>{t.np_colAccess}</div>
            </div>
            {[
              {t:'01', p:'$500.00', r:'$1.25M', wl:true},
              {t:'02', p:'$525.00', r:'$2.56M', wl:true},
              {t:'03', p:'$551.25', r:'$3.94M', wl:true},
              {t:'04', p:'$578.81', r:'$5.39M', wl:true},
              {t:'05', p:'$607.75', r:'$6.91M', wl:true},
              {t:'06', p:'$638.14', r:'$8.51M', wl:false},
              {t:'07', p:'$670.05', r:'$10.19M', wl:false},
              {t:'08', p:'$703.55', r:'$11.95M', wl:false},
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-[50px_1fr_1fr_1fr] px-5 py-3 items-center border-b border-white/[0.03] text-[13px] last:border-0 odd:bg-white/[0.01]">
                <div className="font-mono text-xs text-[#5A6A82]">{row.t}</div>
                <div className="font-mono text-sm font-semibold text-[#F8FAFF]">{row.p}</div>
                <div className="font-mono text-xs text-[#10B981]">{row.r}</div>
                <div>
                  <span className={`font-mono text-[9px] tracking-[0.08em] px-2 py-1 rounded text-center inline-block ${row.wl ? 'bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B]' : 'bg-[#1A56DB]/10 border border-[#1A56DB]/20 text-[#60A5FA]'}`}>
                    {row.wl ? 'WL 50%' : 'PUBLIC'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Late Tiers */}
          <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1A56DB]/10 border-b border-white/5 font-mono text-[10px] tracking-[0.15em] text-[#60A5FA] uppercase">{t.np_lateTiersTitle}</div>
            <div className="grid grid-cols-[50px_1fr_1fr_1fr] px-5 py-2.5 bg-white/[0.02] border-b border-white/[0.03] font-mono text-[10px] tracking-[0.1em] text-[#5A6A82] uppercase">
              <div>{t.np_colTier}</div><div>{t.np_colPrice}</div><div>{t.np_colRaise}</div><div>{t.np_colAccess}</div>
            </div>
            {[
              {t:'10', p:'$814.45', r:'$17.64M'},
              {t:'15', p:'$1,039.46', r:'$33.80M'},
              {t:'20', p:'$1,326.65', r:'$55.68M'},
              {t:'25', p:'$1,693.18', r:'$84.70M'},
              {t:'30', p:'$2,160.97', r:'$121.99M'},
              {t:'35', p:'$2,758.19', r:'$168.36M'},
              {t:'40', p:'$3,354.61', r:'~$151M*'},
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-[50px_1fr_1fr_1fr] px-5 py-3 items-center border-b border-white/[0.03] text-[13px] last:border-0 odd:bg-white/[0.01]">
                <div className="font-mono text-xs text-[#5A6A82]">{row.t}</div>
                <div className="font-mono text-sm font-semibold text-[#F8FAFF]">{row.p}</div>
                <div className="font-mono text-xs text-[#10B981]">{row.r}</div>
                <div>
                  <span className="font-mono text-[9px] tracking-[0.08em] px-2 py-1 rounded text-center inline-block bg-[#1A56DB]/10 border border-[#1A56DB]/20 text-[#60A5FA]">
                    PUBLIC
                  </span>
                </div>
              </div>
            ))}
            <div className="text-[10px] text-[#5A6A82] font-mono px-5 py-2">{t.np_burnNote}</div>
          </div>
        </div>

        {/* Whitelist Section */}
        <div className="bg-[#0A0F1C] border border-[#F59E0B]/20 rounded-[14px] p-7 md:p-8 mb-10 grid md:grid-cols-2 gap-10">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-[#F59E0B] uppercase mb-2.5">{t.np_wlTitle}</div>
            <div className="font-display text-[32px] tracking-[0.05em] leading-[1.1] text-[#F8FAFF] mb-2">{t.np_wlCount1}<br/>{t.np_wlCount2}</div>
            <div className="text-[13px] text-[#5A6A82] leading-relaxed mt-2.5">
              <strong className="text-[#F8FAFF] font-medium">{t.np_wlDescBold}</strong>{' '}{t.np_wlDesc}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 justify-center">
            {[
              {icon:'⬡', text: t.np_wl1, sub: t.np_wl1Sub},
              {icon:'◈', text: t.np_wl2, sub: t.np_wl2Sub},
              {icon:'◆', text: t.np_wl3, sub: t.np_wl3Sub},
              {icon:'◉', text: t.np_wl4, sub: t.np_wl4Sub},
              {icon:'✦', text: t.np_wl5, sub: t.np_wl5Sub},
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 bg-[#F59E0B]/5 border border-[#F59E0B]/10 rounded-lg">
                <div className="text-base shrink-0 text-[#F59E0B]">{item.icon}</div>
                <div className="flex-1 text-[13px] font-medium text-[#F8FAFF]">{item.text}</div>
                <div className="font-mono text-[9px] text-[#F59E0B] tracking-[0.1em] uppercase">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Strip */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          <div className="bg-[#0A0F1C] border border-white/5 rounded-[10px] p-5">
            <div className="font-mono text-[9px] tracking-[0.15em] text-[#5A6A82] mb-2.5 uppercase">{t.np_payTitle}</div>
            <div className="text-[15px] font-medium text-[#F8FAFF] mb-1">{t.np_payCurrencies}</div>
            <div className="text-xs text-[#5A6A82] leading-snug">{t.np_payDesc}</div>
          </div>
          <div className="bg-[#0A0F1C] border border-white/5 rounded-[10px] p-5">
            <div className="font-mono text-[9px] tracking-[0.15em] text-[#5A6A82] mb-2.5 uppercase">{t.np_termsTitle}</div>
            <div className="flex flex-wrap gap-1.5">
              {[t.np_term1, t.np_term2, t.np_term3].map(tag => (
                <span key={tag} className="inline-block bg-[#10B981]/10 border border-[#10B981]/25 rounded-full px-2.5 py-1 font-mono text-[11px] text-[#10B981]">{tag}</span>
              ))}
            </div>
          </div>
          <div className="bg-[#0A0F1C] border border-white/5 rounded-[10px] p-5">
            <div className="font-mono text-[9px] tracking-[0.15em] text-[#5A6A82] mb-2.5 uppercase">{t.np_earnTitle}</div>
            <div className="text-xs text-[#5A6A82] leading-[1.6]">
              <span className="text-[#F8FAFF] font-medium">{t.np_earn1}</span> — {t.np_earn1Desc}<br/>
              <span className="text-[#F8FAFF] font-medium">{t.np_earn2}</span> — {t.np_earn2Desc}<br/>
              <span className="text-[#F8FAFF] font-medium">{t.np_earn3}</span> — {t.np_earn3Desc}<br/>
              <span className="text-[#F8FAFF] font-medium">{t.np_earn4}</span> — {t.np_earn4Desc}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-7 border-t border-white/5">
          <div className="font-display text-[22px] tracking-[0.15em]">OPERON <em className="text-[#60A5FA] not-italic">NETWORK</em></div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-[#5A6A82]">{t.np_footerReg}</div>
          <div className="font-mono text-[10px] text-[#5A6A82] tracking-[0.1em]">$OPRN · ARBITRUM · 2026</div>
        </div>

      </div>
    </div>
  );
};

export default NodesPage;
