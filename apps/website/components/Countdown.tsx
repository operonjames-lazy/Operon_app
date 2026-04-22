
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const Countdown: React.FC<{ labels: { d: string, h: string, m: string, s: string, title: string } }> = ({ labels }) => {
  const targetDate = new Date('2026-05-01T00:00:00').getTime();
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const now = new Date().getTime();
    const difference = targetDate - now;

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const Box = ({ value, label }: { value: number, label: string }) => (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16 md:w-20 md:h-20 bg-[#0a0a0a] border border-[#ffcc00]/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,204,0,0.1)] group overflow-hidden">
        {/* Animated Corner Accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#ffcc00]" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#ffcc00]" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#ffcc00]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#ffcc00]" />
        
        {/* Scanline */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#ffcc00]/5 to-transparent -translate-y-full group-hover:translate-y-full transition-transform duration-1000" />
        
        <span className="text-2xl md:text-4xl font-black text-[#ffcc00] mono tabular-nums tracking-tighter">
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-6 p-6">
       <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-[#ffcc00] rounded-full animate-pulse" />
          <span className="text-[#ffcc00] text-[10px] font-black tracking-[0.3em] uppercase">{labels.title}</span>
          <div className="w-1.5 h-1.5 bg-[#ffcc00] rounded-full animate-pulse" />
       </div>
       
       <div className="flex gap-4 md:gap-6">
         <Box value={timeLeft.days} label={labels.d} />
         <Box value={timeLeft.hours} label={labels.h} />
         <Box value={timeLeft.minutes} label={labels.m} />
         <Box value={timeLeft.seconds} label={labels.s} />
       </div>
    </div>
  );
};

export default Countdown;
