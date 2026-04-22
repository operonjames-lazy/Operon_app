
import React from 'react';
import { motion } from 'framer-motion';

interface DiagnosticGraphicProps {
  t: {
    diagOtherAgents: string;
    diagNoRails: string;
    diagIsolated: string;
    diagLonelyNode: string;
    diagNoTrust: string;
    diagUsers: string;
  }
}

const DiagnosticGraphic: React.FC<DiagnosticGraphicProps> = ({ t }) => {
  return (
    <div className="relative w-full h-full min-h-[320px] flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden bg-black/40">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      <div className="relative z-10 w-full max-w-3xl flex items-center justify-between gap-2 md:gap-8">
        
        {/* LEFT: SUPPLY (High Volume) */}
        <div className="flex flex-col items-center gap-4 w-1/3 relative">
           <div className="text-[10px] mono uppercase text-[#00f2ff] tracking-widest font-bold text-center whitespace-nowrap">
             {t.diagOtherAgents}
           </div>
           
           {/* Agent Grid - Active & Pulsing */}
           <div className="relative grid grid-cols-3 gap-3 p-4 glass rounded-2xl border-[#00f2ff]/30 shadow-[0_0_20px_rgba(0,242,255,0.1)]">
              {[...Array(9)].map((_, i) => (
                <motion.div 
                  key={`agent-${i}`}
                  className="w-3 h-3 rounded-full bg-[#00f2ff]"
                  animate={{ 
                    opacity: [0.4, 1, 0.4],
                    scale: [0.8, 1.2, 0.8],
                    boxShadow: ['0 0 0px rgba(0,242,255,0)', '0 0 10px rgba(0,242,255,0.5)', '0 0 0px rgba(0,242,255,0)']
                  }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
              
              {/* Emitting Particles */}
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={`particle-${i}`}
                  className="absolute right-0 top-1/2 w-2 h-2 rounded-full bg-[#00f2ff]"
                  initial={{ x: 0, opacity: 0 }}
                  animate={{ x: 60, opacity: [0, 1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
                />
              ))}
           </div>
           <div className="text-[8px] text-[#00f2ff]/60 uppercase tracking-widest font-bold">High Supply</div>
        </div>

        {/* CENTER: THE BOTTLENECK */}
        <div className="flex-1 flex flex-col items-center justify-center relative h-40 w-full max-w-[200px]">
           
           {/* Funnel Graphic */}
           <div className="absolute inset-0 flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 200 100" preserveAspectRatio="none" className="drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                 {/* Top Wall */}
                 <path d="M0,10 C60,10 80,45 120,45 L200,45" fill="none" stroke="#ef4444" strokeWidth="2" className="opacity-50" />
                 <path d="M0,10 C60,10 80,45 120,45 L200,45" fill="none" stroke="#ef4444" strokeWidth="8" className="opacity-10 blur-sm" />
                 
                 {/* Bottom Wall */}
                 <path d="M0,90 C60,90 80,55 120,55 L200,55" fill="none" stroke="#ef4444" strokeWidth="2" className="opacity-50" />
                 <path d="M0,90 C60,90 80,55 120,55 L200,55" fill="none" stroke="#ef4444" strokeWidth="8" className="opacity-10 blur-sm" />
                 
                 {/* Vertical Blockers */}
                 <line x1="120" y1="45" x2="120" y2="55" stroke="#ef4444" strokeWidth="2" strokeDasharray="2 2" />
              </svg>
           </div>
           
           {/* Congestion Point */}
           <div className="relative z-10 flex items-center justify-center">
              <motion.div 
                className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                animate={{ scale: [1, 1.1, 1], borderColor: ['rgba(239,68,68,0.5)', 'rgba(239,68,68,1)', 'rgba(239,68,68,0.5)'] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                 <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </motion.div>
           </div>

           {/* Label */}
           <motion.div 
             className="absolute -bottom-6 bg-[#050505] border border-red-500/50 px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.15)]"
             animate={{ y: [0, -2, 0] }}
             transition={{ duration: 2, repeat: Infinity }}
           >
              <span className="text-[9px] font-black uppercase text-red-500 tracking-widest whitespace-nowrap flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {t.diagNoRails}
              </span>
           </motion.div>
        </div>

        {/* RIGHT: DEMAND (Starved) */}
        <div className="flex flex-col items-center gap-4 w-1/3 relative opacity-60">
           <div className="text-[10px] mono uppercase text-white tracking-widest font-bold text-center whitespace-nowrap">
             {t.diagUsers}
           </div>
           
           {/* User Grid - Inactive/Waiting */}
           <div className="relative grid grid-cols-3 gap-3 p-4 glass rounded-2xl border-white/10 grayscale">
              {[...Array(9)].map((_, i) => (
                <div 
                  key={`user-${i}`}
                  className="w-3 h-3 rounded-full bg-white/20 border border-white/10"
                />
              ))}
              
              {/* No Signal Icons */}
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="bg-black/80 px-2 py-1 rounded border border-white/10 backdrop-blur-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" /></svg>
                 </div>
              </div>
           </div>
           <div className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">{t.diagLonelyNode}</div>
        </div>

      </div>
    </div>
  );
};

export default DiagnosticGraphic;
