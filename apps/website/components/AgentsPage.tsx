
import React from 'react';
import { motion } from 'framer-motion';

interface AgentsPageProps {
  t: any;
  onNavigate?: (page: 'home' | 'agents' | 'nodes') => void;
  selectedAgent: number | null;
  setSelectedAgent: (index: number | null) => void;
  selectedArchAgent: number | null;
  setSelectedArchAgent: (index: number | null) => void;
}

// --- COMPLEX GRAPHIC COMPONENTS ---

const GraphicDeFi: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#050505] p-6 overflow-hidden flex flex-col font-mono text-[10px] select-none">
    {/* Terminal Header */}
    <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
       <div className="flex items-center gap-2">
         <div className="w-2 h-2 rounded-full bg-[#00f2ff] animate-pulse" />
         <span className="text-[#00f2ff] font-bold">KAIRON_X_CORE</span>
       </div>
       <div className="flex gap-4 text-gray-500">
          <span>{t.graphicLabels.latency}: <span className="text-white">12ms</span></span>
          <span>{t.graphicLabels.gas}: <span className="text-white">14 gwei</span></span>
       </div>
    </div>
    
    <div className="flex gap-4 h-full">
       {/* Left: Market Depth / Order Book */}
       <div className="w-1/3 border-r border-white/10 pr-4 space-y-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">{t.graphicLabels.orderDepth}</div>
          {[1, 2, 3, 4, 5].map((i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0.5 }}
               animate={{ opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }}
               className="flex justify-between items-center"
             >
                <span className={i < 3 ? "text-red-400" : "text-green-400"}>{i < 3 ? t.graphicLabels.ask : t.graphicLabels.bid}</span>
                <span className="text-gray-400">{(1800 + i * 0.5).toFixed(2)}</span>
                <div className="w-8 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                        className={`h-full ${i < 3 ? "bg-red-500" : "bg-green-500"}`}
                        initial={{ width: "20%" }}
                        animate={{ width: ["20%", "80%", "40%"] }}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
                    />
                </div>
             </motion.div>
          ))}
       </div>

       {/* Right: Chart & Execution */}
       <div className="flex-1 flex flex-col relative">
           <div className="flex-1 relative border border-white/5 bg-white/[0.02] rounded overflow-hidden mb-2">
               {/* Grid */}
               <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
               
               {/* Professional Chart Line */}
               <svg className="absolute inset-0 w-full h-full overflow-visible">
                  <motion.path 
                     d="M0,150 L40,140 L80,145 L120,110 L160,115 L200,80 L240,85 L280,50 L320,60 L360,40 L400,20"
                     fill="none"
                     stroke="#00f2ff"
                     strokeWidth="1.5"
                     initial={{ pathLength: 0 }}
                     animate={{ pathLength: 1 }}
                     transition={{ duration: 2 }}
                  />
                  {/* Area Fill */}
                  <motion.path 
                     d="M0,150 L40,140 L80,145 L120,110 L160,115 L200,80 L240,85 L280,50 L320,60 L360,40 L400,20 V200 H0 Z"
                     fill="url(#gradient-defi)"
                     stroke="none"
                     opacity="0.1"
                  />
                  <defs>
                     <linearGradient id="gradient-defi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00f2ff" />
                        <stop offset="100%" stopColor="transparent" />
                     </linearGradient>
                  </defs>
               </svg>

               {/* Execution Markers */}
               <motion.div 
                 className="absolute top-[40%] left-[50%] w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e]"
                 initial={{ scale: 0 }}
                 animate={{ scale: [0, 1.5, 1] }}
                 transition={{ delay: 1, duration: 0.5 }}
               />
               <motion.div 
                 className="absolute top-[20%] left-[80%] w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]"
                 initial={{ scale: 0 }}
                 animate={{ scale: [0, 1.5, 1] }}
                 transition={{ delay: 2, duration: 0.5 }}
               />
           </div>
           
           {/* Logs */}
           <div className="h-16 bg-black border border-white/10 p-2 font-mono text-[8px] text-gray-400 overflow-hidden">
               <motion.div animate={{ y: [-20, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                   <div className="text-blue-400">[EXEC] {t.graphicLabels.liqRebal} (Pool A)</div>
                   <div className="text-green-400">[YIELD] +0.42% {t.graphicLabels.effGain}</div>
                   <div className="text-gray-500">[VERIFY] {t.graphicLabels.zkProof}</div>
               </motion.div>
           </div>
       </div>
    </div>
  </div>
);

const GraphicSaaS: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0f0f11] p-6 flex items-center justify-between gap-6 overflow-hidden">
     {/* Left: Legacy Monolith */}
     <div className="flex flex-col items-center gap-2 relative z-10">
        <div className="w-20 h-24 bg-gray-800 rounded-lg border-2 border-gray-700 flex items-center justify-center relative">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-1 p-1 opacity-20">
                {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white rounded-sm" />)}
            </div>
        </div>
        <div className="text-[9px] text-gray-500 uppercase font-mono">{t.graphicLabels.legacy}</div>
     </div>

     {/* Middle: Transformation Beam */}
     <div className="flex-1 h-32 relative flex items-center justify-center">
        {/* Beam */}
        <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-gray-700 via-[#ffcc00] to-[#ffcc00]/20" />
        
        {/* Scanner */}
        <motion.div 
            className="absolute top-0 bottom-0 w-[2px] bg-[#ffcc00] shadow-[0_0_15px_#ffcc00]"
            animate={{ left: ['0%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        
        <div className="absolute top-1/2 -translate-y-6 text-[8px] text-[#ffcc00] uppercase tracking-widest bg-black px-1">
            {t.graphicLabels.scanning}
        </div>

        {/* Particles Flying */}
        {[1, 2, 3, 4].map(i => (
           <motion.div 
              key={i}
              className="absolute w-2 h-2 bg-[#ffcc00] rounded-sm"
              initial={{ left: '10%', opacity: 0 }}
              animate={{ left: '90%', opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
              style={{ top: `${30 + Math.random() * 40}%`}}
           />
        ))}
     </div>

     {/* Right: Microservices */}
     <div className="flex flex-col items-center gap-2 relative z-10">
        <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(i => (
               <motion.div 
                 key={i}
                 className="w-8 h-8 rounded-lg bg-[#ffcc00]/10 border border-[#ffcc00]/50 flex items-center justify-center"
                 initial={{ scale: 0 }}
                 animate={{ scale: 1 }}
                 transition={{ delay: 1 + i * 0.2 }}
               >
                   <div className="w-3 h-3 border-2 border-[#ffcc00] rounded-full" />
               </motion.div>
            ))}
        </div>
        <div className="text-[9px] text-[#ffcc00] uppercase font-mono">{t.graphicLabels.microservices}</div>
     </div>
  </div>
);

const GraphicLogistics: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#050505] overflow-hidden flex flex-col">
     {/* Map Background */}
     <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 60 }).map((_, i) => (
           <div 
             key={i}
             className="absolute w-1 h-1 bg-white rounded-full"
             style={{ 
               left: `${Math.random() * 100}%`, 
               top: `${Math.random() * 100}%` 
             }} 
           />
        ))}
     </div>

     {/* Route Line */}
     <svg className="absolute inset-0 w-full h-full">
         <motion.path 
            d="M50,150 Q150,50 350,100"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="5 5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2 }}
         />
         <motion.circle r="3" fill="#00f2ff">
             <animateMotion dur="4s" repeatCount="indefinite" path="M50,150 Q150,50 350,100" />
         </motion.circle>
     </svg>

     {/* Controls Overlay */}
     <div className="absolute top-4 right-4 glass px-3 py-2 rounded-lg border border-white/20 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
            <span className="text-[8px] text-gray-400 uppercase">{t.graphicLabels.temp}</span>
            <span className="text-[10px] text-[#00f2ff] font-mono">4.2°C</span>
        </div>
        {/* Temp Gauge */}
        <div className="w-24 h-1 bg-gray-700 rounded-full overflow-hidden relative">
            <div className="absolute left-1/2 -translate-x-1/2 w-1 h-full bg-white z-10" /> {/* Target */}
            <motion.div 
               className="h-full bg-[#00f2ff]"
               animate={{ width: ['40%', '60%', '45%'] }}
               transition={{ duration: 3, repeat: Infinity }}
            />
        </div>
     </div>

     <div className="absolute bottom-4 left-4 flex gap-2">
        <motion.div 
           className="glass px-3 py-1 rounded-full border border-green-500/50 text-green-500 text-[8px] uppercase font-bold flex items-center gap-1"
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 1 }}
        >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {t.graphicLabels.customs}
        </motion.div>
     </div>
  </div>
);

const GraphicSecurity: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#080202] flex items-center justify-center p-8 overflow-hidden">
     {/* Grid Lines */}
     <div className="absolute inset-0 bg-[linear-gradient(rgba(239,68,68,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,0.05)_1px,transparent_1px)] bg-[size:30px_30px]" />

     {/* Central Node (Core) */}
     <div className="relative z-10 w-24 h-24 border border-red-500/30 rounded-full flex items-center justify-center bg-black shadow-[0_0_30px_rgba(239,68,68,0.1)]">
        <motion.div 
           className="absolute inset-0 rounded-full border border-dashed border-red-500/50"
           animate={{ rotate: 360 }}
           transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />
        <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
     </div>

     {/* Satellite Nodes being patched */}
     {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 120;
        const y = Math.sin(angle) * 120;
        
        return (
           <motion.div 
              key={i}
              className="absolute w-8 h-8 rounded-lg bg-black border flex items-center justify-center z-10"
              style={{ x, y }}
              initial={{ borderColor: 'rgba(239,68,68,0.5)', color: 'rgba(239,68,68,0.8)' }}
              animate={{ 
                 borderColor: ['rgba(239,68,68,0.5)', 'rgba(34,197,94,0.5)', 'rgba(34,197,94,0.5)', 'rgba(239,68,68,0.5)'],
                 color: ['rgba(239,68,68,0.8)', 'rgba(34,197,94,0.8)', 'rgba(34,197,94,0.8)', 'rgba(239,68,68,0.8)'],
              }}
              transition={{ duration: 4, delay: i * 0.5, repeat: Infinity }}
           >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /></svg>
              
              {/* Connecting Line */}
              <motion.div 
                 className="absolute top-1/2 left-1/2 h-[1px] bg-red-500/20 origin-left -z-10"
                 style={{ width: 120, rotate: `${angle + 180}rad` }} // Points back to center roughly
              />
           </motion.div>
        );
     })}

     <div className="absolute bottom-4 left-4 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-[8px] text-red-500 font-mono">
        {t.graphicLabels.threat}: {t.graphicLabels.critical}
     </div>
  </div>
);



const GraphicEnergy: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#050505] overflow-hidden flex flex-col items-center justify-center p-6">
     {/* Grid Background */}
     <div className="absolute inset-0 bg-[linear-gradient(rgba(0,242,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
     
     {/* Central Power Hub */}
     <div className="relative z-10 w-20 h-20 rounded-full border-2 border-[#00f2ff] flex items-center justify-center shadow-[0_0_30px_rgba(0,242,255,0.3)]">
        <motion.div 
           className="w-12 h-12 bg-[#00f2ff]/20 rounded-full"
           animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
           transition={{ duration: 2, repeat: Infinity }}
        />
        <svg className="absolute w-8 h-8 text-[#00f2ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
     </div>

     {/* Satellite Nodes */}
     {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 100;
        const y = Math.sin(angle) * 100;
        return (
           <motion.div 
              key={i}
              className="absolute w-8 h-8 bg-black border border-[#00f2ff]/50 rounded-lg flex items-center justify-center z-10"
              style={{ x, y }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.2 }}
           >
              <div className="w-2 h-2 bg-[#00f2ff] rounded-full" />
              {/* Energy Beam */}
              <motion.div 
                 className="absolute top-1/2 left-1/2 h-[1px] bg-[#00f2ff]/30 origin-left -z-10"
                 style={{ width: 100, rotate: `${angle + 180}rad` }}
                 initial={{ opacity: 0 }}
                 animate={{ opacity: [0, 1, 0] }}
                 transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
              />
           </motion.div>
        );
     })}
  </div>
);

const GraphicMeridian: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center p-6 font-mono">
     {/* Health Factor Gauge */}
     <div className="relative w-40 h-40 mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
           <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="8" />
           <motion.circle 
              cx="50" cy="50" r="45" fill="none" stroke="#00f2ff" strokeWidth="8"
              strokeDasharray="283"
              strokeDashoffset="283"
              animate={{ strokeDashoffset: 60 }}
              transition={{ duration: 2, ease: "easeOut" }}
           />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
           <span className="text-3xl font-bold text-white">1.85</span>
           <span className="text-[10px] text-gray-500 uppercase">{t.graphicLabels.healthFactor}</span>
        </div>
     </div>

     {/* Active Positions */}
     <div className="w-full max-w-[200px] space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
           <span>AAVE V3</span>
           <span className="text-green-400">{t.graphicLabels.optimal}</span>
        </div>
        <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
           <motion.div className="h-full bg-green-500" initial={{ width: 0 }} animate={{ width: "85%" }} transition={{ duration: 1.5 }} />
        </div>
     </div>
  </div>
);

const GraphicQuill: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0510] flex items-center justify-center overflow-hidden font-mono">
     {/* Background Grid */}
     <div className="absolute inset-0 bg-[linear-gradient(rgba(255,204,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,0,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
     
     {/* Viral Spread Network */}
     <div className="relative w-full h-full flex items-center justify-center">
        
        {/* Central Core */}
        <div className="relative z-30">
            <motion.div 
               className="w-16 h-16 rounded-full bg-[#ffcc00] flex items-center justify-center shadow-[0_0_50px_rgba(255,204,0,0.4)] border-2 border-white/20"
               animate={{ scale: [1, 1.1, 1] }}
               transition={{ duration: 2, repeat: Infinity }}
            >
               {/* Quill Icon */}
               <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </motion.div>
            {/* Ripple Effect */}
            <motion.div 
               className="absolute inset-0 rounded-full border border-[#ffcc00]/50"
               initial={{ scale: 1, opacity: 1 }}
               animate={{ scale: 3, opacity: 0 }}
               transition={{ duration: 2, repeat: Infinity }}
            />
        </div>

        {/* Node Network */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
           const angle = (i / 8) * Math.PI * 2;
           const dist = 120;
           const x = Math.cos(angle) * dist;
           const y = Math.sin(angle) * dist;
           
           return (
              <React.Fragment key={i}>
                 {/* Connection Line */}
                 <div 
                    className="absolute top-1/2 left-1/2 h-[1px] bg-[#ffcc00]/20 origin-left z-0"
                    style={{ width: dist, transform: `rotate(${angle * (180/Math.PI)}deg)` }}
                 >
                    <motion.div 
                       className="w-full h-full bg-[#ffcc00]"
                       initial={{ scaleX: 0 }}
                       animate={{ scaleX: [0, 1, 0] }}
                       transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                    />
                 </div>

                 {/* Satellite Node */}
                 <motion.div 
                    className="absolute w-8 h-8 rounded-lg bg-[#1a1a0a] border border-[#ffcc00]/50 flex items-center justify-center z-20 shadow-[0_0_15px_rgba(255,204,0,0.2)]"
                    style={{ x, y }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                 >
                    {/* Icons representing content types */}
                    {i % 3 === 0 && <span className="text-[10px] font-bold text-white">{t.graphicLabels.txt}</span>}
                    {i % 3 === 1 && <div className="w-3 h-3 rounded-sm bg-gradient-to-tr from-yellow-400 to-orange-600" />}
                    {i % 3 === 2 && <span className="text-[10px] font-bold text-[#ffcc00]">{t.graphicLabels.img}</span>}
                    
                    {/* Pop-up Stats */}
                    <motion.div 
                       className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] text-[#ffcc00] font-bold whitespace-nowrap bg-black/80 px-1 rounded border border-[#ffcc00]/30"
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: [0, 1, 0], y: -10 }}
                       transition={{ duration: 2, repeat: Infinity, delay: 1 + i * 0.2 }}
                    >
                       +{Math.floor(Math.random() * 900) + 100} {t.graphicLabels.views}
                    </motion.div>
                 </motion.div>
              </React.Fragment>
           );
        })}

        {/* Outer Ring (Reach) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <motion.div 
              className="w-[350px] h-[350px] rounded-full border border-[#ffcc00]/10 border-dashed"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, ease: "linear", repeat: Infinity }}
           />
        </div>
     </div>

     {/* Dashboard Overlay */}
     <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
        <div className="flex gap-4">
           <div className="glass px-3 py-2 rounded-lg border border-[#ffcc00]/30">
              <div className="text-[8px] text-[#ffcc00]/70 uppercase tracking-wider">{t.graphicLabels.totalReach}</div>
              <motion.div 
                 className="text-lg font-bold text-white"
                 animate={{ opacity: [0.8, 1, 0.8] }}
                 transition={{ duration: 0.5, repeat: Infinity }}
              >
                 1.2M
              </motion.div>
           </div>
           <div className="glass px-3 py-2 rounded-lg border border-[#ffcc00]/30">
              <div className="text-[8px] text-[#ffcc00]/70 uppercase tracking-wider">{t.graphicLabels.engage}</div>
              <div className="text-lg font-bold text-[#ffcc00]">8.4%</div>
           </div>
        </div>
        
        <div className="text-[9px] text-[#ffcc00]/50 uppercase tracking-[0.2em] animate-pulse">
           {t.graphicLabels.distActive}
        </div>
     </div>
  </div>
);

const GraphicZenith: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center p-6">
     {/* Grid lines */}
     <svg className="absolute inset-0 w-full h-full opacity-10">
        {[20,40,60,80].map(y => <line key={`h${y}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="white" strokeWidth="0.5" />)}
        {[20,40,60,80].map(x => <line key={`v${x}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="white" strokeWidth="0.5" />)}
     </svg>
     {/* Candlestick-style price line */}
     <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
        <motion.path
           d="M 20 140 L 60 120 L 100 130 L 140 90 L 180 100 L 220 60 L 260 80 L 300 50 L 340 70 L 380 40"
           fill="none" stroke="#FFCC00" strokeWidth="2" strokeLinecap="round"
           initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
           transition={{ duration: 2.5, ease: "easeOut" }}
        />
        <motion.path
           d="M 20 140 L 60 120 L 100 130 L 140 90 L 180 100 L 220 60 L 260 80 L 300 50 L 340 70 L 380 40 L 380 200 L 20 200 Z"
           fill="url(#zenithGrad)" opacity="0.3"
           initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}
           transition={{ duration: 2, delay: 1 }}
        />
        <defs>
           <linearGradient id="zenithGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFCC00" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FFCC00" stopOpacity="0" />
           </linearGradient>
        </defs>
     </svg>
     {/* Signal dots */}
     {[{x:140,y:90,d:0.8},{x:220,y:60,d:1.2},{x:340,y:70,d:1.8}].map((p,i) => (
        <motion.div key={i} className="absolute w-3 h-3 rounded-full bg-[#00F2FF] shadow-[0_0_8px_rgba(0,242,255,0.6)]"
           style={{ left: `${p.x/4}%`, top: `${p.y/2}%` }}
           initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0,1.2,1], opacity: 1 }}
           transition={{ duration: 0.5, delay: p.d + 1 }}
        />
     ))}
  </div>
);

const GraphicAtelier: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
     {/* Color Palette Swatches */}
     <div className="absolute inset-0 flex items-center justify-center">
        {[0, 1, 2].map(i => (
           <motion.div 
              key={i}
              className="absolute w-40 h-40 rounded-full mix-blend-screen filter blur-xl opacity-50"
              style={{ 
                 backgroundColor: ['#ff0080', '#7928ca', '#0070f3'][i],
                 left: `calc(50% + ${(i-1)*30}px)`,
                 top: `calc(50% + ${(i-1)*20}px)`
              }}
              animate={{ 
                 scale: [1, 1.2, 1],
                 x: [0, (i-1)*20, 0],
                 y: [0, (i-1)*-20, 0]
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
           />
        ))}
     </div>

     {/* Frame */}
     <div className="relative z-10 w-48 h-64 border border-white/20 bg-white/5 backdrop-blur-md rounded-lg p-4 flex flex-col gap-4">
        <div className="w-full h-32 bg-white/10 rounded" />
        <div className="w-full h-2 bg-white/20 rounded" />
        <div className="w-2/3 h-2 bg-white/20 rounded" />
     </div>
  </div>
);

const GraphicArbiter: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center p-6">
     {/* Document Scan */}
     <div className="relative w-48 h-64 bg-white/5 border border-white/10 rounded-lg overflow-hidden flex flex-col p-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
           <div key={i} className="w-full h-2 bg-white/10 rounded" />
        ))}
        
        {/* Scanning Beam */}
        <motion.div 
           className="absolute top-0 left-0 w-full h-1 bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]"
           animate={{ top: ["0%", "100%", "0%"] }}
           transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
     </div>

     {/* Checkmark Badge */}
     <motion.div 
        className="absolute bottom-10 right-10 w-12 h-12 bg-green-500/20 rounded-full border border-green-500 flex items-center justify-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
     >
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
     </motion.div>
  </div>
);

const GraphicEpoch: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
     {/* Data Funnel */}
     <div className="relative w-64 h-64">
        {/* Orbiting Data Points */}
        {[0, 1, 2, 3, 4].map(i => (
           <motion.div 
              key={i}
              className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full"
              animate={{ 
                 rotate: 360,
                 x: Math.cos(i * 72 * Math.PI / 180) * 80,
                 y: Math.sin(i * 72 * Math.PI / 180) * 80
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
              style={{ marginLeft: -4, marginTop: -4 }}
           />
        ))}

        {/* Central Core */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-white/5 border border-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
           <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse" />
        </div>
     </div>
  </div>
);

const GraphicHerald: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center p-6">
     {/* Broadcast Tower */}
     <div className="relative z-10 w-16 h-32 flex flex-col items-center justify-end">
        <motion.div 
           className="w-1 h-full bg-gradient-to-t from-gray-800 to-white/50"
           initial={{ height: 0 }}
           animate={{ height: "100%" }}
           transition={{ duration: 1 }}
        />
        <div className="absolute top-0 w-4 h-4 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] animate-pulse" />
        
        {/* Signal Waves */}
        {[1, 2, 3].map(i => (
           <motion.div 
              key={i}
              className="absolute top-0 rounded-full border border-white/30"
              initial={{ width: 0, height: 0, opacity: 1 }}
              animate={{ width: i * 100, height: i * 100, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
           />
        ))}
     </div>

     {/* Channel Icons */}
     <div className="absolute inset-0">
        {[0, 1, 2, 3].map(i => {
           const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
           const x = Math.cos(angle) * 100;
           const y = Math.sin(angle) * 100;
           return (
              <motion.div 
                 key={i}
                 className="absolute top-1/2 left-1/2 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20"
                 style={{ x, y, marginLeft: -16, marginTop: -16 }}
                 initial={{ scale: 0 }}
                 animate={{ scale: 1 }}
                 transition={{ delay: 0.5 + i * 0.1 }}
              >
                 <div className="w-4 h-4 bg-white/50 rounded-sm" />
              </motion.div>
           );
        })}
     </div>
  </div>
);

const GraphicScout: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden p-6">
     {/* Grid of Agents */}
     <div className="grid grid-cols-4 gap-4 opacity-50">
        {Array.from({ length: 12 }).map((_, i) => (
           <div key={i} className="w-full h-8 bg-white/5 rounded border border-white/10" />
        ))}
     </div>

     {/* Scanner Lens */}
     <motion.div 
        className="absolute w-24 h-24 rounded-full border-2 border-[#00f2ff] shadow-[0_0_30px_rgba(0,242,255,0.2)] backdrop-blur-sm flex items-center justify-center z-10"
        animate={{ 
           x: [0, 100, 0, -100, 0],
           y: [0, 50, 100, 50, 0]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{ top: '30%', left: '40%' }}
     >
        <div className="w-full h-[1px] bg-[#00f2ff]/50 absolute top-1/2" />
        <div className="h-full w-[1px] bg-[#00f2ff]/50 absolute left-1/2" />
        <div className="text-[8px] text-[#00f2ff] font-mono absolute bottom-2 right-4">{t.graphicLabels.scan}</div>
     </motion.div>
  </div>
);

const GraphicBridge: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
     {/* Left: User */}
     <div className="absolute left-10 w-12 h-12 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center z-10">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
     </div>

     {/* Right: Ecosystem */}
     <div className="absolute right-10 grid grid-cols-2 gap-2 z-10">
        {[1, 2, 3, 4].map(i => (
           <div key={i} className="w-8 h-8 rounded bg-[#ffcc00]/10 border border-[#ffcc00]/30" />
        ))}
     </div>

     {/* Bridge Path */}
     <svg className="absolute inset-0 w-full h-full">
        <motion.path 
           d="M80,100 Q150,50 220,100"
           fill="none"
           stroke="#ffcc00"
           strokeWidth="2"
           strokeDasharray="5 5"
           initial={{ pathLength: 0 }}
           animate={{ pathLength: 1 }}
           transition={{ duration: 1.5 }}
        />
        <motion.circle r="3" fill="white">
           <animateMotion dur="2s" repeatCount="indefinite" path="M80,100 Q150,50 220,100" />
        </motion.circle>
     </svg>
  </div>
);

const GraphicLedger: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex flex-col items-center p-6 font-mono">
     {/* Scrolling Ledger */}
     <div className="w-full max-w-[200px] space-y-2 relative z-10">
        {[1, 2, 3, 4, 5].map(i => (
           <motion.div 
              key={i}
              className="flex justify-between text-[8px] text-gray-500 border-b border-white/5 pb-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.2 }}
           >
              <span>TX_HASH_{9000+i}</span>
              <span className="text-green-500">{t.graphicLabels.verified}</span>
           </motion.div>
        ))}
     </div>

     {/* Verification Stamp */}
     <motion.div 
        className="absolute bottom-6 right-6 border-2 border-green-500 text-green-500 px-2 py-1 text-[10px] font-bold uppercase -rotate-12 opacity-0"
        animate={{ opacity: [0, 1, 1, 0], scale: [2, 1, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
     >
        {t.graphicLabels.audited}
     </motion.div>
  </div>
);

const GraphicCurator: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
     {/* Funnel */}
     <div className="relative w-32 h-40">
        {/* Particles In */}
        {[1, 2, 3, 4, 5].map(i => (
           <motion.div 
              key={i}
              className="absolute top-0 w-2 h-2 bg-gray-500 rounded-full"
              style={{ left: `${20 + i * 15}%` }}
              animate={{ top: "50%", opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
           />
        ))}
        
        {/* Filter Shape */}
        <svg className="absolute inset-0 w-full h-full text-white/10" viewBox="0 0 100 100" preserveAspectRatio="none">
           <path d="M0,0 L40,50 L40,100 L60,100 L60,50 L100,0 Z" fill="currentColor" />
        </svg>

        {/* Gold Star Out */}
        <motion.div 
           className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-6 text-[#ffcc00]"
           animate={{ y: [0, 20], opacity: [1, 0] }}
           transition={{ duration: 1.5, repeat: Infinity }}
        >
           <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        </motion.div>
     </div>
  </div>
);

const GraphicRelay: React.FC<{t: any}> = ({t}) => (
  <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center gap-12">
     {/* Agent A */}
     <div className="w-12 h-12 border border-white/20 rounded-lg flex items-center justify-center bg-white/5">
        <span className="text-[10px] font-mono text-gray-500">A</span>
     </div>

     {/* Agent B */}
     <div className="w-12 h-12 border border-white/20 rounded-lg flex items-center justify-center bg-white/5">
        <span className="text-[10px] font-mono text-gray-500">B</span>
     </div>

     {/* Packet */}
     <motion.div 
        className="absolute w-4 h-4 bg-[#00f2ff] rounded shadow-[0_0_10px_#00f2ff]"
        animate={{ left: ["35%", "65%", "35%"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
     />
  </div>
);

const AgentsPage: React.FC<AgentsPageProps> = ({ 
  t, 
  onNavigate,
  selectedAgent,
  setSelectedAgent,
  selectedArchAgent,
  setSelectedArchAgent
}) => {
  const caseStudies = [
    {
      title: t.cs3Title,
      desc: t.cs3Desc,
      logic: t.cs3Logic,
      graphic: <GraphicZenith t={t} />,
      liveDemo: "/zenith/",
      liveDemoBtnText: t.liveDemoBtnZenith || "View Live Trading",
      liveDemoBtnClass: "bg-[#ffcc00]/10 border border-[#ffcc00]/30 text-[#ffcc00] hover:bg-[#ffcc00]/20",
      how: t.cs3How,
      steps: [
        { label: t.cs3Step1, desc: t.cs3Step1Desc },
        { label: t.cs3Step2, desc: t.cs3Step2Desc },
        { label: t.cs3Step3, desc: t.cs3Step3Desc },
        { label: t.cs3Step4, desc: t.cs3Step4Desc }
      ],
      color: "border-[#ffcc00]",
      icon: (
        <svg className="w-8 h-8 text-[#ffcc00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    },
    {
      title: t.cs1Title,
      desc: t.cs1Desc,
      logic: t.cs1Logic,
      graphic: <GraphicQuill t={t} />,
      liveDemo: "/quill/",
      liveDemoBtnText: t.liveDemoBtnQuill || "View Live Content",
      liveDemoBtnClass: "bg-[#ff9500]/10 border border-[#ff9500]/30 text-[#ff9500] hover:bg-[#ff9500]/20",
      steps: [
        { label: t.cs1Step1, desc: t.cs1Step1Desc },
        { label: t.cs1Step2, desc: t.cs1Step2Desc },
        { label: t.cs1Step3, desc: t.cs1Step3Desc },
        { label: t.cs1Step4, desc: t.cs1Step4Desc },
        { label: t.cs1Step5, desc: t.cs1Step5Desc },
        { label: t.cs1Step6, desc: t.cs1Step6Desc }
      ],
      color: "border-[#ff9500]",
      icon: (
        <svg className="w-8 h-8 text-[#ff9500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )
    },
    {
      title: t.cs2Title,
      desc: t.cs2Desc,
      logic: t.cs2Logic,
      graphic: <GraphicMeridian t={t} />,
      steps: [
        { label: t.cs2Step1, desc: t.cs2Step1Desc },
        { label: t.cs2Step2, desc: t.cs2Step2Desc },
        { label: t.cs2Step3, desc: t.cs2Step3Desc }
      ],
      color: "border-[#00f2ff]",
      icon: (
        <svg className="w-8 h-8 text-[#00f2ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    },
    {
      title: t.cs4Title,
      desc: t.cs4Desc,
      logic: t.cs4Logic,
      graphic: <GraphicAtelier t={t} />,
      steps: [
        { label: t.cs4Step1, desc: t.cs4Step1Desc },
        { label: t.cs4Step2, desc: t.cs4Step2Desc },
        { label: t.cs4Step3, desc: t.cs4Step3Desc }
      ],
      color: "border-purple-500",
      icon: (
        <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )
    },
    {
      title: t.cs5Title,
      desc: t.cs5Desc,
      logic: t.cs5Logic,
      graphic: <GraphicArbiter t={t} />,
      steps: [
        { label: t.cs5Step1, desc: t.cs5Step1Desc },
        { label: t.cs5Step2, desc: t.cs5Step2Desc },
        { label: t.cs5Step3, desc: t.cs5Step3Desc }
      ],
      color: "border-green-500",
      icon: (
        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: t.cs6Title,
      desc: t.cs6Desc,
      logic: t.cs6Logic,
      graphic: <GraphicEpoch t={t} />,
      steps: [
        { label: t.cs6Step1, desc: t.cs6Step1Desc },
        { label: t.cs6Step2, desc: t.cs6Step2Desc },
        { label: t.cs6Step3, desc: t.cs6Step3Desc }
      ],
      color: "border-gray-400",
      icon: (
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    }
  ];

  const archAgents = [
    {
      title: t.arch1Title, desc: t.arch1Desc, logic: t.arch1Logic, graphic: <GraphicHerald t={t} />,
      steps: [{label: t.arch1Step1, desc: t.arch1Step1Desc}, {label: t.arch1Step2, desc: t.arch1Step2Desc}, {label: t.arch1Step3, desc: t.arch1Step3Desc}],
      color: "border-white"
    },
    {
      title: t.arch2Title, desc: t.arch2Desc, logic: t.arch2Logic, graphic: <GraphicScout t={t} />,
      steps: [{label: t.arch2Step1, desc: t.arch2Step1Desc}, {label: t.arch2Step2, desc: t.arch2Step2Desc}, {label: t.arch2Step3, desc: t.arch2Step3Desc}],
      color: "border-[#00f2ff]"
    },
    {
      title: t.arch3Title, desc: t.arch3Desc, logic: t.arch3Logic, graphic: <GraphicBridge t={t} />,
      steps: [{label: t.arch3Step1, desc: t.arch3Step1Desc}, {label: t.arch3Step2, desc: t.arch3Step2Desc}, {label: t.arch3Step3, desc: t.arch3Step3Desc}],
      color: "border-[#ffcc00]"
    },
    {
      title: t.arch4Title, desc: t.arch4Desc, logic: t.arch4Logic, graphic: <GraphicLedger t={t} />,
      steps: [{label: t.arch4Step1, desc: t.arch4Step1Desc}, {label: t.arch4Step2, desc: t.arch4Step2Desc}, {label: t.arch4Step3, desc: t.arch4Step3Desc}],
      color: "border-gray-400"
    },
    {
      title: t.arch5Title, desc: t.arch5Desc, logic: t.arch5Logic, graphic: <GraphicCurator t={t} />,
      steps: [{label: t.arch5Step1, desc: t.arch5Step1Desc}, {label: t.arch5Step2, desc: t.arch5Step2Desc}, {label: t.arch5Step3, desc: t.arch5Step3Desc}],
      color: "border-purple-500"
    },
    {
      title: t.arch6Title, desc: t.arch6Desc, logic: t.arch6Logic, graphic: <GraphicRelay t={t} />,
      steps: [{label: t.arch6Step1, desc: t.arch6Step1Desc}, {label: t.arch6Step2, desc: t.arch6Step2Desc}, {label: t.arch6Step3, desc: t.arch6Step3Desc}],
      color: "border-red-500"
    }
  ];

  return (
    <div className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-24">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full glass border border-white/10 text-[10px] font-black tracking-[0.2em] text-[#00f2ff] uppercase italic"
            >
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#00f2ff] animate-pulse" />
                {t.agentsPageBadge}
            </motion.div>
            
            <motion.h1 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter"
            >
                {t.agentsPageTitle}
            </motion.h1>
            
            <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl md:text-2xl text-gray-400 font-light max-w-2xl mx-auto"
            >
                {t.agentsPageSub}
            </motion.p>
        </div>

        {selectedAgent === null ? (
          /* Grid View */
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {caseStudies.map((study, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelectedAgent(i)}
                className={`group cursor-pointer glass p-8 rounded-3xl border border-white/5 hover:border-opacity-50 transition-all hover:bg-white/5 relative overflow-hidden ${study.color.replace('border', 'hover:border')}`}
              >
                <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                   <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
                
                <div className="mb-6 p-4 rounded-2xl bg-white/5 w-fit group-hover:scale-110 transition-transform duration-500">
                  {study.icon}
                </div>
                
                <h3 className="text-xl font-black uppercase italic mb-3 tracking-tight group-hover:text-white transition-colors">{study.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{study.desc}</p>
                
                <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-${study.color.split('-')[1]}-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              </motion.div>
            ))}
          </div>
        ) : (
          /* Detail View */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Top Back Button */}
            <div className="flex justify-start">
                <button 
                  onClick={() => setSelectedAgent(null)}
                  className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  Back to Grid
                </button>
            </div>

            <div className="glass rounded-[2rem] border border-white/5 bg-[#050505]/50 overflow-hidden relative group">
                <div className="flex flex-col h-full">
                   
                   {/* Top: Graphic Area (Large) */}
                   <div className="w-full h-96 border-b border-white/5 relative overflow-hidden bg-black/50">
                      {caseStudies[selectedAgent].graphic}
                      <div className="absolute top-4 left-4 text-[10px] font-mono uppercase text-white/40 tracking-widest bg-black/50 px-2 py-1 rounded backdrop-blur-md">{t.agentsLiveSim}</div>
                   </div>

                   {/* Bottom: Content & Workflow */}
                   <div className="p-8 md:p-12 flex flex-col justify-center space-y-10">
                      <div>
                          <div className={`w-12 h-1 bg-gradient-to-r from-transparent to-transparent ${caseStudies[selectedAgent].color.replace('border', 'bg')} opacity-50 mb-6`} />
                          <h3 className="text-4xl font-black uppercase italic mb-4 tracking-tight">{caseStudies[selectedAgent].title}</h3>
                          <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-8">{caseStudies[selectedAgent].desc}</p>
                          
                          <div className="bg-white/5 border-l-2 border-white/20 pl-6 py-2 max-w-3xl">
                             <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Agentic Logic Core</h4>
                             <p className="text-gray-400 text-sm leading-relaxed font-mono">{caseStudies[selectedAgent].logic}</p>
                          </div>

                          {(caseStudies[selectedAgent] as any).how && (
                            <div className="bg-white/5 border-l-2 border-[#ffcc00]/30 pl-6 py-2 max-w-3xl mt-4">
                               <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">How It Trades</h4>
                               <p className="text-gray-400 text-sm leading-relaxed font-mono">{(caseStudies[selectedAgent] as any).how}</p>
                            </div>
                          )}

                          {caseStudies[selectedAgent].liveDemo && (
                            <a href={caseStudies[selectedAgent].liveDemo} target="_blank" rel="noopener noreferrer"
                               className={`inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-lg text-sm font-semibold transition-colors ${caseStudies[selectedAgent].liveDemoBtnClass || "bg-[#ffcc00]/10 border border-[#ffcc00]/30 text-[#ffcc00] hover:bg-[#ffcc00]/20"}`}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              {caseStudies[selectedAgent].liveDemoBtnText || t.liveDemoBtn || "View Live"}
                            </a>
                          )}
                      </div>

                      {/* Sequential Workflow Visualization */}
                      <div className="bg-[#0a0a0a] rounded-xl border border-white/5 p-8 relative">
                          <div className="absolute -top-3 left-4 px-3 bg-[#0a0a0a] text-[10px] font-mono text-gray-400 uppercase tracking-widest border border-white/10 rounded">{t.agentsSequence}</div>
                          
                          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mt-4 pt-4">
                             {caseStudies[selectedAgent].steps.map((step: any, idx: number) => (
                               <React.Fragment key={idx}>
                                 {/* Step Node */}
                                 <div className="flex flex-col items-center gap-4 relative z-10 w-full md:w-auto flex-1 text-center">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${caseStudies[selectedAgent].color} border-opacity-30 bg-white/5 shadow-lg group-hover:scale-110 transition-transform`}>
                                       <span className="font-bold text-lg text-white/90">{idx + 1}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                       <div className="text-sm font-bold uppercase tracking-wider text-white">{step.label}</div>
                                       <div className="text-xs text-gray-400 leading-snug max-w-[200px]">{step.desc}</div>
                                    </div>
                                 </div>

                                 {/* Connector Path */}
                                 {idx < caseStudies[selectedAgent].steps.length - 1 && (
                                   <div className="relative flex-1 h-12 md:h-[2px] w-[2px] md:w-full bg-white/5 mx-4 self-center hidden md:block mt-8">
                                      <motion.div 
                                         className={`absolute top-0 left-0 w-2 h-2 rounded-full ${caseStudies[selectedAgent].color.replace('border', 'bg')}`}
                                         animate={{ 
                                           left: ['0%', '100%'],
                                           top: ['0%', '100%']
                                         }}
                                         transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: idx * 0.5 }}
                                      />
                                   </div>
                                 )}
                                 
                                 {/* Mobile Connector */}
                                 {idx < caseStudies[selectedAgent].steps.length - 1 && (
                                    <div className="md:hidden h-12 w-[1px] bg-white/10 my-4 self-center" />
                                 )}
                               </React.Fragment>
                             ))}
                          </div>
                      </div>
                   </div>

                </div>
            </div>

            <div className="flex justify-center pt-8">
                <button 
                  onClick={() => setSelectedAgent(null)}
                  className="group relative bg-transparent border border-white text-white px-12 py-5 rounded-full font-black text-xs uppercase tracking-widest overflow-hidden transition-all hover:bg-white hover:text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                >
                  <span className="relative z-10 block flex items-center gap-2">
                    <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    Back to Grid
                  </span>
                </button>
            </div>
          </motion.div>
        )}

        {/* Architectural Agents Section (The Solution) */}
        {!selectedAgent && (
          <div className="mt-32">
             <div className="mb-12 border-t border-white/10 pt-12">
                <div className="text-[#00f2ff] text-xs font-black tracking-widest uppercase italic mb-4">{t.archBadge}</div>
                <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">{t.archAgentsTitle}</h2>
                <p className="text-gray-400 max-w-2xl text-lg">{t.archAgentsSub}</p>
             </div>

             {selectedArchAgent === null ? (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {archAgents.map((agent, index) => (
                   <motion.div
                     key={index}
                     layoutId={`arch-card-${index}`}
                     onClick={() => setSelectedArchAgent(index)}
                     className="group relative bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 cursor-pointer hover:border-white/30 transition-all h-[400px] flex flex-col"
                   >
                     <div className="flex-1 mb-6 relative overflow-hidden rounded-xl bg-white/5 border border-white/5">
                        {agent.graphic}
                     </div>
                     
                     <h3 className="text-xl font-black uppercase italic mb-3 tracking-tight group-hover:text-white transition-colors">{agent.title}</h3>
                     <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{agent.desc}</p>
                     
                     <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                   </motion.div>
                 ))}
               </div>
             ) : (
               /* Arch Agent Detail View */
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -20 }}
                 className="space-y-8"
               >
                 {/* Top Back Button */}
                 <div className="flex justify-start">
                     <button 
                       onClick={() => setSelectedArchAgent(null)}
                       className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                     >
                       <svg className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                       Back to Grid
                     </button>
                 </div>

                 <div className="glass rounded-[2rem] border border-white/5 bg-[#050505]/50 overflow-hidden relative group">
                     <div className="flex flex-col h-full">
                        
                        {/* Top: Graphic Area */}
                        <div className="w-full h-96 border-b border-white/5 relative overflow-hidden bg-black/50">
                           {archAgents[selectedArchAgent].graphic}
                           <div className="absolute top-4 left-4 text-[10px] font-mono uppercase text-white/40 tracking-widest bg-black/50 px-2 py-1 rounded backdrop-blur-md">Internal Protocol</div>
                        </div>

                        {/* Bottom: Content */}
                        <div className="p-8 md:p-12 flex flex-col justify-center space-y-10">
                           <div>
                               <div className={`w-12 h-1 bg-gradient-to-r from-transparent to-transparent ${archAgents[selectedArchAgent].color.replace('border', 'bg')} opacity-50 mb-6`} />
                               <h3 className="text-4xl font-black uppercase italic mb-4 tracking-tight">{archAgents[selectedArchAgent].title}</h3>
                               <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-8">{archAgents[selectedArchAgent].desc}</p>
                               
                               <div className="bg-white/5 border-l-2 border-white/20 pl-6 py-2 max-w-3xl">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Agentic Logic Core</h4>
                                  <p className="text-gray-400 text-sm leading-relaxed font-mono">{archAgents[selectedArchAgent].logic}</p>
                               </div>
                           </div>

                           {/* Workflow */}
                           <div className="bg-[#0a0a0a] rounded-xl border border-white/5 p-8 relative">
                               <div className="absolute -top-3 left-4 px-3 bg-[#0a0a0a] text-[10px] font-mono text-gray-400 uppercase tracking-widest border border-white/10 rounded">{t.agentsSequence}</div>
                               
                               <div className="flex flex-col md:flex-row items-start justify-between gap-8 mt-4 pt-4">
                                  {archAgents[selectedArchAgent].steps.map((step: any, idx: number) => (
                                    <React.Fragment key={idx}>
                                      <div className="flex flex-col items-center gap-4 relative z-10 w-full md:w-auto flex-1 text-center">
                                         <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${archAgents[selectedArchAgent].color} border-opacity-30 bg-white/5 shadow-lg group-hover:scale-110 transition-transform`}>
                                            <span className="font-bold text-lg text-white/90">{idx + 1}</span>
                                         </div>
                                         <div className="flex flex-col items-center gap-2">
                                            <div className="text-sm font-bold uppercase tracking-wider text-white">{step.label}</div>
                                            <div className="text-xs text-gray-400 leading-snug max-w-[200px]">{step.desc}</div>
                                         </div>
                                      </div>

                                      {idx < archAgents[selectedArchAgent].steps.length - 1 && (
                                        <div className="relative flex-1 h-12 md:h-[2px] w-[2px] md:w-full bg-white/5 mx-4 self-center hidden md:block mt-8">
                                           <motion.div 
                                              className={`absolute top-0 left-0 w-2 h-2 rounded-full ${archAgents[selectedArchAgent].color.replace('border', 'bg')}`}
                                              animate={{ left: ['0%', '100%'], top: ['0%', '100%'] }}
                                              transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: idx * 0.5 }}
                                           />
                                        </div>
                                      )}
                                      
                                      {idx < archAgents[selectedArchAgent].steps.length - 1 && (
                                         <div className="md:hidden h-12 w-[1px] bg-white/10 my-4 self-center" />
                                      )}
                                    </React.Fragment>
                                  ))}
                               </div>
                           </div>
                        </div>
                     </div>
                 </div>

                 <div className="flex justify-center pt-8">
                     <button 
                       onClick={() => setSelectedArchAgent(null)}
                       className="group relative bg-transparent border border-white text-white px-12 py-5 rounded-full font-black text-xs uppercase tracking-widest overflow-hidden transition-all hover:bg-white hover:text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                     >
                       <span className="relative z-10 block flex items-center gap-2">
                         <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                         Back to Grid
                       </span>
                     </button>
                 </div>
               </motion.div>
             )}
          </div>
        )}

        <div className="flex justify-center pt-16">
             <button 
                onClick={() => onNavigate && onNavigate('nodes')}
                className="group relative bg-transparent border border-[#ffcc00] text-[#ffcc00] px-12 py-5 rounded-full font-black text-xs uppercase tracking-widest overflow-hidden transition-all hover:bg-[#ffcc00] hover:text-black shadow-[0_0_20px_rgba(255,204,0,0.1)] hover:shadow-[0_0_40px_rgba(255,204,0,0.3)]"
             >
                <span className="relative z-10 block flex items-center gap-2">
                   {t.agentsToNodesBtn}
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </span>
             </button>
        </div>

      </div>
    </div>
  );
};

export default AgentsPage;
