
import React from 'react';
import { motion } from 'framer-motion';

interface AgentWorkforceGraphicProps {
  t?: any;
}

const AgentWorkforceGraphic: React.FC<AgentWorkforceGraphicProps> = ({ t }) => {
  // Fallback for independent testing if t is missing, though App passes it.
  const labels = t?.graphicLabels || {
      awgSwarm: "Agentic AI Swarm",
      awgAgentData: "Data Agent",
      awgAgentLogic: "Logic Agent",
      awgAgentVerify: "Verify Agent",
      awgProtocol: "Operon Protocol",
      awgInteraction: "Interaction Layer",
      awgSecured: "Secured by Operon Nodes",
      awgOutcome: "Verified Outcome",
      awgSettlement: "L3 Settlement"
  };

  return (
    <div className="relative w-full h-full min-h-[500px] flex items-center justify-center overflow-hidden bg-black/20 rounded-[3rem] border border-white/5">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(0,242,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />

      {/* Added pt-20 on mobile to ensure the -top-12 label doesn't get clipped by overflow-hidden */}
      <div className="relative z-10 w-full max-w-5xl h-full flex flex-col md:flex-row items-center justify-between p-8 pt-20 md:p-16 gap-12">
        
        {/* LEFT: Agent Cluster (The Input) */}
        <div className="flex flex-col gap-6 items-center md:items-end relative z-20">
            <div className="absolute -inset-10 bg-blue-500/10 blur-3xl rounded-full" />
            
            {/* Group Label - Positioned absolutely. With pt-20 in container, this is now safe. */}
            <div className="absolute -top-12 md:right-0 bg-[#00f2ff]/10 border border-[#00f2ff]/30 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest text-[#00f2ff] whitespace-nowrap">
               {labels.awgSwarm}
            </div>

            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.2 }}
                    className="relative group"
                >
                    <div className="flex items-center gap-4">
                        <div className="text-[10px] font-mono text-[#00f2ff] opacity-0 group-hover:opacity-100 transition-opacity hidden md:block whitespace-nowrap">
                             {i === 0 ? labels.awgAgentData : i === 1 ? labels.awgAgentLogic : labels.awgAgentVerify}
                        </div>
                        <div className="w-16 h-16 glass rounded-2xl border border-[#00f2ff]/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,242,255,0.1)] bg-[#050505] relative overflow-hidden">
                            <div className="absolute inset-0 bg-[#00f2ff]/10 animate-pulse" />
                            <svg className="w-6 h-6 text-[#00f2ff] relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {i === 0 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
                                {i === 1 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />}
                                {i === 2 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                            </svg>
                        </div>
                    </div>
                    
                    {/* Connecting Line to Center */}
                    <svg className="absolute top-1/2 -right-24 w-24 h-[2px] hidden md:block overflow-visible pointer-events-none z-0">
                        <motion.line 
                            x1="0" y1="0" x2="100%" y2="0" 
                            stroke="#00f2ff" 
                            strokeWidth="1" 
                            strokeDasharray="4 4"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                        />
                        <motion.circle 
                            r="3" fill="#fff"
                            animate={{ cx: ["0%", "100%"] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
                        />
                    </svg>
                </motion.div>
            ))}
        </div>

        {/* CENTER: Operon Protocol Interaction Layer */}
        <div className="relative flex flex-col items-center justify-center z-30">
             <motion.div 
                className="w-1 h-32 md:h-64 bg-gradient-to-b from-transparent via-[#00f2ff] to-transparent absolute"
                animate={{ opacity: [0.3, 1, 0.3], height: ['80%', '100%', '80%'] }}
                transition={{ duration: 2, repeat: Infinity }}
             />
             
             <motion.div 
                className="w-40 h-40 md:w-56 md:h-56 glass rounded-full border border-white/20 flex flex-col items-center justify-center relative shadow-[0_0_60px_rgba(0,242,255,0.15)] bg-[#050505]/80 backdrop-blur-xl"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
             >
                {/* Rotating Rings */}
                <div className="absolute inset-2 rounded-full border border-dashed border-[#00f2ff]/30 animate-[spin_10s_linear_infinite]" />
                <div className="absolute inset-6 rounded-full border border-[#00f2ff]/20 animate-[spin_15s_linear_infinite_reverse]" />
                
                {/* Core Logo/Text */}
                <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-[#00f2ff] rounded-lg flex items-center justify-center">
                         <span className="font-black text-black">OP</span>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white text-center leading-tight">
                        Operon<br/>Protocol
                    </div>
                    <div className="text-[8px] text-gray-400 uppercase tracking-widest mt-1 whitespace-nowrap">{labels.awgInteraction}</div>
                </div>

                {/* Processing Particles */}
                {[0, 1, 2, 3].map(i => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-white rounded-full"
                        animate={{ 
                            x: [0, (Math.random() - 0.5) * 40], 
                            y: [0, (Math.random() - 0.5) * 40], 
                            opacity: [1, 0] 
                        }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                ))}
             </motion.div>
        </div>

        {/* RIGHT: Outcome (The Result) */}
        <div className="relative flex flex-col items-start justify-center z-20">
             <div className="absolute -inset-10 bg-[#ffcc00]/10 blur-3xl rounded-full" />
             
             {/* Connection from Center */}
             <div className="absolute top-1/2 -left-24 w-24 h-[2px] hidden md:block overflow-visible">
                 <div className="w-full h-full bg-gradient-to-r from-[#00f2ff] to-[#ffcc00] opacity-30" />
                 <motion.div 
                    className="w-20 h-full bg-white blur-[2px]"
                    animate={{ x: [-100, 100] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                 />
             </div>

             <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="relative w-40 h-40 glass rounded-3xl border border-[#ffcc00]/30 flex flex-col items-center justify-center gap-4 shadow-[0_0_40px_rgba(255,204,0,0.15)] bg-gradient-to-br from-[#050505] to-[#ffcc00]/10"
             >
                {/* Security Badge Overlay */}
                <div className="absolute -top-3 -right-3 flex items-center gap-1 bg-[#ffcc00] text-black px-2 py-1 rounded shadow-lg z-10">
                   <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                   <span className="text-[7px] font-black uppercase tracking-widest whitespace-nowrap">{labels.awgSecured}</span>
                </div>

                <div className="w-16 h-16 rounded-full bg-[#ffcc00] flex items-center justify-center shadow-[0_0_20px_#ffcc00]">
                    <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div className="text-center">
                    <div className="text-sm font-black uppercase text-white whitespace-nowrap">{labels.awgOutcome}</div>
                    <div className="text-[10px] text-[#ffcc00] font-mono mt-1 whitespace-nowrap">{labels.awgSettlement}</div>
                </div>
             </motion.div>
        </div>

      </div>
    </div>
  );
};

export default AgentWorkforceGraphic;
