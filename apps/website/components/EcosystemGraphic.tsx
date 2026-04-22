
import React from 'react';
import { motion } from 'framer-motion';

interface EcosystemGraphicProps {
  t: {
    ecoCreators: string;
    ecoBuilders: string;
    ecoAgents: string;
    ecoService: string;
    ecoUsers: string;
    ecoConsumer: string;
    ecoReferred: string;
    ecoReputation: string;
  }
}

const EcosystemGraphic: React.FC<EcosystemGraphicProps> = ({ t }) => {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 overflow-hidden bg-black/20">
      {/* Background Tech Patterns */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#00f2ff_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Main Container - Responsive Layout */}
      <div className="relative z-10 w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 items-center">
        
        {/* COLUMN 1: DISCOVER (Formerly Creators) */}
        <div className="flex flex-col items-center space-y-4">
           <div className="text-[10px] mono uppercase text-[#00f2ff] tracking-widest font-bold text-center whitespace-pre-line">{t.ecoCreators}</div>
           
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.5 }}
             className="relative p-4 glass rounded-2xl border-[#00f2ff]/30 flex flex-col items-center gap-3 group w-full"
           >
              {/* Discover Icon (Magnifying Glass / Scan) */}
              <div className="w-10 h-10 rounded-full bg-[#00f2ff]/10 border border-[#00f2ff]/40 flex items-center justify-center">
                 <svg className="w-5 h-5 text-[#00f2ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                 </svg>
              </div>
              <div className="text-[7px] text-gray-400 font-bold uppercase tracking-wider text-center whitespace-pre-line">{t.ecoBuilders}</div>

              {/* Action: Arrow */}
              <motion.div 
                className="absolute -bottom-5 md:bottom-auto md:-right-5 md:top-1/2 md:-translate-y-1/2 flex flex-col md:flex-row items-center z-20"
                animate={{ 
                    x: [0, 5, 0], 
                    y: [0, 0, 0]
                }}
              >
                 <div className="hidden md:flex items-center">
                     <div className="h-[1px] w-4 bg-gradient-to-r from-[#00f2ff] to-[#ffcc00]" />
                     <svg className="w-3 h-3 text-[#ffcc00] -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                 </div>
                 {/* Mobile Arrow Down */}
                 <div className="md:hidden flex flex-col items-center mt-2">
                     <div className="w-[1px] h-4 bg-gradient-to-b from-[#00f2ff] to-[#ffcc00]" />
                     <svg className="w-3 h-3 text-[#ffcc00] -mt-1 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                 </div>
              </motion.div>
           </motion.div>
        </div>

        {/* COLUMN 2: DISTRIBUTE (Formerly Agents) */}
        <div className="flex flex-col items-center space-y-4 relative py-4 md:py-0">
           <div className="text-[10px] mono uppercase text-[#ffcc00] tracking-widest font-bold text-center whitespace-pre-line">{t.ecoAgents}</div>
           
           {/* Network Container */}
           <div className="relative w-full aspect-square max-w-[140px] md:max-w-[180px] border border-dashed border-[#ffcc00]/20 rounded-full bg-[#ffcc00]/5 flex items-center justify-center p-2">
              
              {/* Central Hub */}
              <div className="absolute inset-0 animate-[spin_10s_linear_infinite] opacity-30">
                 <div className="absolute top-0 left-1/2 w-px h-full bg-[#ffcc00]/10 -translate-x-1/2" />
                 <div className="absolute top-1/2 left-0 w-full h-px bg-[#ffcc00]/10 -translate-y-1/2" />
              </div>

              {/* Nodes */}
              <div className="grid grid-cols-2 gap-3 relative z-10">
                  {[1, 2, 3, 4].map((i) => (
                    <motion.div 
                       key={i}
                       className="relative w-8 h-8 rounded-lg bg-[#0a0a0a] border border-[#ffcc00]/40 flex items-center justify-center shadow-[0_0_15px_rgba(255,204,0,0.1)]"
                       animate={{ 
                         y: [0, -2, 0],
                         borderColor: ['rgba(255,204,0,0.4)', 'rgba(255,204,0,0.8)', 'rgba(255,204,0,0.4)']
                       }}
                       transition={{ duration: 2 + i, repeat: Infinity, delay: i * 0.2 }}
                    >
                       <svg className="w-4 h-4 text-[#ffcc00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       
                       {/* Connection Lines */}
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <motion.div 
                            className="w-[140%] h-px bg-[#ffcc00]/30 absolute top-1/2 left-1/2 origin-left" 
                            style={{ rotate: `${i * 90 + 45}deg`}} 
                          />
                       </div>
                    </motion.div>
                  ))}
              </div>

              {/* Arrow to Next */}
              <motion.div 
                className="absolute -bottom-6 md:bottom-auto md:-right-5 md:top-1/2 md:-translate-y-1/2 z-20"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                  <svg className="hidden md:block w-4 h-4 text-white translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  <svg className="md:hidden w-4 h-4 text-white rotate-90 translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </motion.div>
           </div>
           
           <div className="text-[6px] text-[#ffcc00] uppercase tracking-wider bg-[#ffcc00]/10 px-2 py-0.5 rounded border border-[#ffcc00]/20 whitespace-pre-line text-center">{t.ecoService}</div>
        </div>

        {/* COLUMN 3: ALIGN (Formerly Users) */}
        <div className="flex flex-col items-center space-y-4">
           <div className="text-[10px] mono uppercase text-white tracking-widest font-bold text-center whitespace-pre-line">{t.ecoUsers}</div>
           
           <div className="relative flex flex-col gap-3 w-full items-center">
              
              {/* Incentives / Rewards */}
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="relative p-2 w-full glass rounded-xl border-white/10 flex items-center justify-between gap-2"
              >
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-green-900/20 flex items-center justify-center shrink-0 border border-green-500/30">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[7px] text-gray-400 uppercase">{t.ecoConsumer}</span>
                      {/* Growth Graph */}
                      <div className="flex items-end gap-0.5 h-2">
                         <div className="w-0.5 h-1 bg-green-500/50" />
                         <div className="w-0.5 h-1.5 bg-green-500/70" />
                         <div className="w-0.5 h-2 bg-green-500" />
                      </div>
                    </div>
                 </div>
              </motion.div>

              <div className="h-3 w-[1px] bg-gradient-to-b from-white/20 to-transparent" />

              {/* Growth / Shared Success */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="relative p-2 w-[90%] glass rounded-xl border-white/5 flex items-center gap-2 opacity-80"
              >
                  <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <svg className="w-3 h-3 text-[#00f2ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  </div>
                  <div className="text-[6px] text-[#00f2ff] uppercase border border-[#00f2ff]/20 px-1 rounded">{t.ecoReferred}</div>
              </motion.div>

           </div>
           <div className="text-[6px] text-gray-500 uppercase tracking-wider text-center whitespace-pre-line">{t.ecoReputation}</div>
        </div>

      </div>
    </div>
  );
};

export default EcosystemGraphic;
