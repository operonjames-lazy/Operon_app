
import React from 'react';
import { motion } from 'framer-motion';

interface NodeGraphicProps {
  t: {
    nodeOriginator: string;
    nodeRoyalty: string;
    nodeProtocol: string;
    nodeYield: string;
  }
}

const NodeGraphic: React.FC<NodeGraphicProps> = ({ t }) => {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-8 overflow-hidden bg-black/20">
      {/* Background Tech Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,204,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,0,0.03)_1px,transparent_1px)] bg-[size:30px_30px]" />

      <div className="relative z-10 w-full max-w-[400px] aspect-square flex items-center justify-center">
        
        {/* Outer Data Ring (Viral Loop) */}
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
           className="absolute w-[90%] h-[90%] rounded-full border border-dashed border-[#ffcc00]/10"
        >
             <div className="absolute top-0 left-1/2 w-2 h-2 bg-[#ffcc00] rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#ffcc00]" />
        </motion.div>

        {/* Middle Hexagon (The Graph) */}
        <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute w-[65%] h-[65%] border border-[#ffcc00]/20"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
        >
             {/* Inner connecting lines */}
             <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-full h-[1px] bg-[#ffcc00]/10 absolute top-1/2" />
                 <div className="h-full w-[1px] bg-[#ffcc00]/10 absolute left-1/2" />
             </div>
        </motion.div>

        {/* The License Core (Engine) */}
        <div className="relative w-32 h-32">
           {/* Radiating Glow */}
           <motion.div 
             animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
             transition={{ duration: 3, repeat: Infinity }}
             className="absolute inset-0 bg-[#ffcc00]/20 blur-2xl rounded-full" 
           />
           
           {/* The Core NFT Geometry */}
           <motion.div 
             className="w-full h-full relative flex items-center justify-center"
           >
              {/* Spinning Plates */}
              <motion.div 
                 animate={{ rotateZ: 360 }}
                 transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                 className="absolute w-24 h-24 border-2 border-[#ffcc00] rounded-lg"
              />
              <motion.div 
                 animate={{ rotateZ: -360 }}
                 transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                 className="absolute w-24 h-24 border-2 border-[#ffcc00]/50 rounded-lg rotate-45"
              />
              
              {/* Center Crystal */}
              <div className="w-12 h-12 bg-[#ffcc00] rounded flex items-center justify-center shadow-[0_0_30px_#ffcc00]">
                  <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
              </div>
           </motion.div>
        </div>

        {/* Floating Labels */}
        <motion.div 
           animate={{ y: [0, -5, 0] }}
           transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
           className="absolute top-[15%] right-[5%] bg-[#050505] border border-[#ffcc00]/30 px-2 py-1 rounded backdrop-blur-md"
        >
            <div className="text-[8px] mono uppercase text-[#ffcc00] font-bold whitespace-nowrap">{t.nodeOriginator}</div>
            <div className="text-[10px] mono text-white whitespace-nowrap">{t.nodeRoyalty}</div>
        </motion.div>
        
        <motion.div 
           animate={{ y: [0, 5, 0] }}
           transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
           className="absolute bottom-[15%] left-[5%] bg-[#050505] border border-[#ffcc00]/30 px-2 py-1 rounded backdrop-blur-md"
        >
            <div className="text-[8px] mono uppercase text-[#ffcc00] font-bold whitespace-nowrap">{t.nodeProtocol}</div>
            <div className="text-[10px] mono text-white whitespace-nowrap">{t.nodeYield}</div>
        </motion.div>

      </div>
    </div>
  );
};

export default NodeGraphic;
