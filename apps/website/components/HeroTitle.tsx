
import React from 'react';
import { motion, Variants } from 'framer-motion';

interface HeroTitleProps {
  line1: string;
  line2: string;
}

const HeroTitle: React.FC<HeroTitleProps> = ({ line1, line2 }) => {
  const sentence: Variants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.5,
        staggerChildren: 0.08,
      },
    },
  };

  const letter: Variants = {
    hidden: { opacity: 0, y: 20, filter: "blur(10px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: 'tween',
        duration: 0.4,
        ease: 'easeOut',
      },
    },
  };

  return (
    <div className="relative z-10 select-none cursor-default">
      {/* Visual connection lines effect (background decoration) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <svg className="w-full h-full absolute overflow-visible">
            <motion.path 
                d="M0,50 Q400,0 800,100" 
                fill="none" 
                stroke="#06B6D4" 
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ duration: 2, ease: "easeInOut" }}
            />
            <motion.path 
                d="M100,100 Q400,150 700,50" 
                fill="none" 
                stroke="#60A5FA" 
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.3 }}
                transition={{ duration: 2.5, ease: "easeInOut", delay: 0.5 }}
            />
        </svg>
      </div>

      <motion.h1
        variants={sentence}
        initial="hidden"
        animate="visible"
        className="text-[13vw] md:text-7xl lg:text-8xl font-display uppercase leading-[0.92] tracking-[0.02em] text-center"
      >
        <div className="relative inline-block whitespace-nowrap text-[#F8FAFF]">
           {line1.split("").map((char, index) => (
             <motion.span key={index} variants={letter} className="relative inline-block">
               {char === " " ? "\u00A0" : char}
               {/* Node Dot */}
               <motion.span 
                  className="absolute -top-2 -right-2 w-1 md:w-1.5 h-1 md:h-1.5 bg-[#06B6D4] rounded-full"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1, 0] }}
                  transition={{ duration: 0.5, delay: index * 0.08 + 0.2 }}
               />
               {/* Connecting Line to next char (simulated) */}
               <motion.span 
                  className="absolute top-1/2 left-full w-2 md:w-4 h-[1px] bg-[#06B6D4] origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: [0, 1, 0] }}
                  transition={{ duration: 0.3, delay: index * 0.08 + 0.3 }}
               />
             </motion.span>
           ))}
        </div>
        <br />
        <div className="relative inline-block whitespace-nowrap text-[#60A5FA]">
           {line2.split("").map((char, index) => (
             <motion.span key={index} variants={letter} className="relative inline-block">
               {char === " " ? "\u00A0" : char}
                <motion.span 
                  className="absolute -bottom-2 -left-2 w-1 md:w-1.5 h-1 md:h-1.5 bg-[#F59E0B] rounded-full"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1, 0] }}
                  transition={{ duration: 0.5, delay: index * 0.08 + 0.8 }}
               />
             </motion.span>
           ))}
        </div>
      </motion.h1>
    </div>
  );
};

export default HeroTitle;
