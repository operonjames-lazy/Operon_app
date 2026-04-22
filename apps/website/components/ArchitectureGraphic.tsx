
import React from 'react';
import { motion } from 'framer-motion';

interface ArchitectureGraphicProps {
  t: {
    archLayer1: string;
    archL1Desc: string;
    archLayer2: string;
    archL2Desc: string;
    archLayer3: string;
    archL3Desc: string;
  }
}

const ArchitectureGraphic: React.FC<ArchitectureGraphicProps> = ({ t }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: 20 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="relative w-full max-w-sm flex flex-col gap-4"
      >
        {/* Layer 1: Identity */}
        <motion.div variants={itemVariants} className="relative z-30">
          <div className="glass bg-[#050505]/80 p-4 rounded-xl border-[#00f2ff]/30 flex items-center gap-4 shadow-[0_0_20px_rgba(0,242,255,0.1)]">
            <div className="w-12 h-12 rounded-lg bg-[#00f2ff]/10 border border-[#00f2ff]/50 flex items-center justify-center shrink-0">
               <svg className="w-6 h-6 text-[#00f2ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .854.446 1.643 1.187 2.136" /></svg>
            </div>
            <div>
              <div className="text-[10px] mono text-[#00f2ff] uppercase tracking-widest mb-1">{t.archLayer1}</div>
              <div className="text-white font-bold text-sm">{t.archL1Desc}</div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#00f2ff] rounded-full animate-pulse" />
          </div>
        </motion.div>
        
        {/* Connector */}
        <div className="h-6 w-[1px] bg-gradient-to-b from-[#00f2ff]/50 to-[#ffcc00]/50 mx-auto" />

        {/* Layer 2: Compute */}
        <motion.div variants={itemVariants} className="relative z-20">
          <div className="glass bg-[#050505]/80 p-4 rounded-xl border-[#ffcc00]/30 flex items-center gap-4 shadow-[0_0_20px_rgba(255,204,0,0.1)]">
            <div className="w-12 h-12 rounded-lg bg-[#ffcc00]/10 border border-[#ffcc00]/50 flex items-center justify-center shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
               <svg className="w-6 h-6 text-[#ffcc00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            </div>
            <div>
              <div className="text-[10px] mono text-[#ffcc00] uppercase tracking-widest mb-1">{t.archLayer2}</div>
              <div className="text-white font-bold text-sm">{t.archL2Desc}</div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#ffcc00] rounded-full animate-pulse" />
          </div>
        </motion.div>

        {/* Connector */}
        <div className="h-6 w-[1px] bg-gradient-to-b from-[#ffcc00]/50 to-white/50 mx-auto" />

        {/* Layer 3: Settlement */}
        <motion.div variants={itemVariants} className="relative z-10">
          <div className="glass bg-[#050505]/80 p-4 rounded-xl border-white/20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/30 flex items-center justify-center shrink-0">
               <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <div>
              <div className="text-[10px] mono text-gray-400 uppercase tracking-widest mb-1">{t.archLayer3}</div>
              <div className="text-white font-bold text-sm">{t.archL3Desc}</div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
};

export default ArchitectureGraphic;
