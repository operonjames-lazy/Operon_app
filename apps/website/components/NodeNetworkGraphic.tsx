
import React from 'react';
import { motion } from 'framer-motion';

interface NodeNetworkGraphicProps {
    t?: any;
}

const NodeNetworkGraphic: React.FC<NodeNetworkGraphicProps> = ({ t }) => {
  const labels = t?.graphicLabels || {
      nngNexus: "Operon Nexus Node",
      nngGraphID: "Graph ID",
      nngPeer: "Peer",
      nngRep: "Rep",
      nngFlagged: "FLAGGED"
  };

  return (
    <div className="relative w-full h-full min-h-[500px] flex items-center justify-center overflow-hidden bg-black/20 rounded-[3rem] border border-white/5">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,204,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,0,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Connection Lines (Network Mesh) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = (i / 6) * Math.PI * 2;
            const cx = 50 + Math.cos(angle) * 35;
            const cy = 50 + Math.sin(angle) * 35;

            return (
                <g key={i}>
                    <line x1="50" y1="50" x2={cx} y2={cy} stroke="#ffcc00" strokeWidth="0.3" strokeOpacity="0.2" />
                    <circle r="0.6" fill="#ffcc00" opacity="0.6">
                        <animateMotion
                            path={`M50,50 L${cx},${cy}`}
                            dur={`${2 + i}s`}
                            repeatCount="indefinite"
                        />
                    </circle>
                </g>
            )
        })}
      </svg>
      
      {/* Central Node Entity (The Mother Node) */}
      <div className="relative z-20 flex flex-col items-center">
         <motion.div 
            className="w-48 h-48 rounded-full border border-[#ffcc00]/20 bg-[#050505]/80 backdrop-blur-xl flex items-center justify-center relative shadow-[0_0_60px_rgba(255,204,0,0.15)]"
            animate={{ 
                boxShadow: ['0 0 60px rgba(255,204,0,0.15)', '0 0 100px rgba(255,204,0,0.3)', '0 0 60px rgba(255,204,0,0.15)']
            }}
            transition={{ duration: 4, repeat: Infinity }}
         >
            {/* Spinning Rings */}
            <div className="absolute inset-2 rounded-full border border-dashed border-[#ffcc00]/30 animate-[spin_20s_linear_infinite]" />
            <div className="absolute inset-8 rounded-full border border-dotted border-[#ffcc00]/40 animate-[spin_15s_linear_infinite_reverse]" />
            
            {/* Core Hexagon */}
            <div className="relative w-16 h-16 flex items-center justify-center">
               <svg className="w-full h-full text-[#ffcc00]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
               </svg>
               <motion.div 
                  className="absolute inset-0 bg-[#ffcc00] blur-xl"
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
               />
            </div>
         </motion.div>
         
         <div className="mt-6 text-center space-y-1">
             <div className="text-[#ffcc00] font-black uppercase tracking-[0.2em] text-sm whitespace-nowrap">{labels.nngNexus}</div>
             <div className="text-gray-500 text-[10px] mono uppercase whitespace-nowrap">{labels.nngGraphID}: #004-Alpha</div>
         </div>
      </div>

      {/* Satellite Nodes (The Agents/Peers) */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
         const angle = (i / 6) * Math.PI * 2;
         const radius = 35; // %
         
         // Logic to set specific low reputation nodes (Indices 2 and 4)
         const isLowRep = i === 2 || i === 4;
         
         // Calculate reputation: Bad actors get < 50%, Good actors get 95-99%
         const repValue = isLowRep ? 32 + (i * 3) : 95 + (i % 4); 
         
         // Styling variables based on reputation
         const borderColor = isLowRep ? 'border-red-500/50' : 'border-[#ffcc00]/20';
         const statusColor = isLowRep ? 'bg-red-500' : 'bg-green-500';
         const statusShadow = isLowRep ? 'shadow-[0_0_10px_#ef4444] animate-pulse' : 'shadow-[0_0_5px_#22c55e]';
         const textColor = isLowRep ? 'text-red-500' : 'text-[#ffcc00]';
         const barColor = isLowRep ? 'bg-red-500' : 'bg-[#ffcc00]';

         return (
             <motion.div
                key={i}
                className="absolute w-16 h-16"
                style={{ 
                    top: `calc(50% + ${Math.sin(angle) * radius}%)`, 
                    left: `calc(50% + ${Math.cos(angle) * radius}%)`,
                    x: '-50%',
                    y: '-50%'
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
             >
                <div className={`w-full h-full rounded-xl bg-[#0a0a0a] border ${borderColor} flex flex-col items-center justify-center shadow-lg relative group overflow-visible`}>
                    <div className={`absolute inset-0 ${isLowRep ? 'bg-red-500/5' : 'bg-[#ffcc00]/5'} group-hover:bg-opacity-20 transition-colors rounded-xl`} />
                    
                    {/* Status Dot */}
                    <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${statusColor} ${statusShadow}`} />
                    
                    {/* Alarm Badge for Low Rep */}
                    {isLowRep && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[6px] font-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#ef4444] animate-bounce z-20 whitespace-nowrap">
                            {labels.nngFlagged}
                        </div>
                    )}

                    <div className="text-[8px] text-gray-400 uppercase font-mono mb-1 whitespace-nowrap">{labels.nngPeer} {i + 1}</div>
                    <div className={`text-[10px] font-bold ${textColor} whitespace-nowrap`}>{repValue}% {labels.nngRep}</div>
                    
                    {/* Data Flow Line */}
                    <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/10 overflow-hidden rounded-b-xl">
                        <motion.div 
                           className={`h-full ${barColor}`} 
                           animate={{ width: ['0%', '100%'] }}
                           transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                        />
                    </div>
                </div>
                
                {/* Connecting Line (Visual only, CSS based rotation) */}
                <div 
                    className={`absolute top-1/2 left-1/2 h-[1px] bg-gradient-to-r ${isLowRep ? 'from-red-500/30' : 'from-[#ffcc00]/30'} to-transparent -z-10 origin-left`}
                    style={{ 
                        width: '150%', 
                        transform: `rotate(${angle + Math.PI}rad)`
                    }} 
                />
             </motion.div>
         )
      })}
      
      {/* Floating Data Packets */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <motion.div
             key={`p-${i}`}
             className="absolute w-1 h-1 bg-[#ffcc00] rounded-full"
             initial={{ opacity: 0, x: 0, y: 0 }}
             animate={{ 
                 opacity: [0, 1, 0],
                 x: (Math.random() - 0.5) * 400,
                 y: (Math.random() - 0.5) * 400
             }}
             transition={{ duration: 3, repeat: Infinity, delay: Math.random() * 2 }}
             style={{ top: '50%', left: '50%' }}
          />
      ))}

    </div>
  );
};

export default NodeNetworkGraphic;
