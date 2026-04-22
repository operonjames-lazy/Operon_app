
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
}

const Loader: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing Core...');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(null);
  const particles = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const initParticles = () => {
      particles.current = [];
      const count = 250; 
      for (let i = 0; i < count; i++) {
        particles.current.push({
          x: canvas.width / 2,
          y: canvas.height / 2,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: Math.random() * 2 + 1,
          color: Math.random() > 0.8 ? '#ffcc00' : '#00f2ff',
          alpha: Math.random() * 0.8 + 0.2,
        });
      }
    };
    initParticles();

    const animate = () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((p) => {
        const dx = canvas.width / 2 - p.x;
        const dy = canvas.height / 2 - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Steady orbital/gathering phase (no explosion logic here anymore)
        const force = 0.08;
        p.vx += dx * 0.002 + (dy / dist) * force;
        p.vy += dy * 0.002 - (dx / dist) * force;
        
        p.vx *= 0.97;
        p.vy *= 0.97;

        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        
        if (Math.random() > 0.98) {
           ctx.beginPath();
           ctx.moveTo(canvas.width / 2, canvas.height / 2);
           ctx.lineTo(p.x, p.y);
           ctx.strokeStyle = p.color;
           ctx.globalAlpha = p.alpha * 0.08;
           ctx.stroke();
        }
      });

      // Central Glow
      const glowSize = 180;
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, glowSize
      );
      gradient.addColorStop(0, 'rgba(0, 242, 255, 0.15)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 400); // Quick transition
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 100);

    const statuses = [
      'Synchronizing Hive Grid...',
      'Allocating Liquid Labour...',
      'Verifying Bonded Reputation...',
      'Activating Nexus Nodes...',
      'Grid Online.'
    ];

    let statusIdx = 0;
    const statusTimer = setInterval(() => {
      setStatus(statuses[statusIdx]);
      statusIdx = (statusIdx + 1) % statuses.length;
    }, 600);

    return () => {
      clearInterval(timer);
      clearInterval(statusTimer);
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="fixed inset-0 z-[200] bg-[#050505] flex flex-col items-center justify-center p-6 overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      
      <div className="relative z-10 w-full max-w-xs space-y-6">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <div className="text-[#00f2ff] text-[10px] font-black tracking-widest uppercase italic">Initializing Grid</div>
            <div className="text-white text-xs mono h-4">{status}</div>
          </div>
          <div className="text-white text-xs mono">{Math.floor(progress)}%</div>
        </div>
        
        <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
          <motion.div 
            className="absolute inset-y-0 left-0 bg-[#00f2ff] shadow-[0_0_15px_#00f2ff]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-[8px] text-gray-600 mono uppercase tracking-tighter pt-2">
          <span>Protocol v4.0.2 Stable</span>
          <span>© 2026 Operon Network</span>
        </div>
      </div>
    </motion.div>
  );
};

export default Loader;
