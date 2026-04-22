
import React from 'react';
import { motion } from 'framer-motion';

interface DocsPageProps {
  t: any;
  currentLang: string;
  setLang: (lang: string) => void;
}

const languages = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const DocsPage: React.FC<DocsPageProps> = ({ t, currentLang, setLang }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, we'd show a toast here
  };

  const SectionHeader = ({ title, subtitle }: { title: string, subtitle: string }) => (
    <div className="mb-8 border-l-2 border-[#00f2ff] pl-4">
      <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">{title}</h2>
      <p className="text-gray-400 text-sm mt-1">{subtitle}</p>
    </div>
  );

  const CopyBlock = ({ label, text, rows = 3 }: { label: string, text: string, rows?: number }) => (
    <div className="glass p-6 rounded-xl border border-white/5 group hover:border-[#00f2ff]/30 transition-colors">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#00f2ff]">{label}</span>
        <button 
          onClick={() => copyToClipboard(text)}
          className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-gray-400 hover:text-white transition-colors"
        >
          COPY
        </button>
      </div>
      <textarea 
        readOnly 
        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-gray-300 font-mono focus:outline-none resize-none"
        rows={rows}
        value={text}
      />
    </div>
  );

  return (
    <div className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-20">
        
        {/* Header */}
        <div className="text-center space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full glass border border-white/10 text-[10px] font-black tracking-[0.2em] text-[#00f2ff] uppercase italic"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-[#00f2ff] animate-pulse" />
            {t.docs.learnMore}
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter text-[#00f2ff]"
          >
            {t.docs.title}
          </motion.h1>
          
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            {t.docs.subtitle}
          </p>
        </div>

        {/* Language Selector */}
        <div className="flex flex-wrap justify-center gap-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLang(lang.code)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                currentLang === lang.code
                  ? 'bg-[#00f2ff] text-black shadow-[0_0_20px_rgba(0,242,255,0.4)] scale-105'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Brand Identity */}
        {/* <section>
          <SectionHeader title={t.docs.brandTitle} subtitle={t.docs.brandSubtitle} />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#00f2ff] shadow-[0_0_20px_rgba(0,242,255,0.3)]" />
              <div>
                <div className="font-bold text-white">{t.docs.brandCyan}</div>
                <div className="font-mono text-xs text-gray-500">#00F2FF</div>
                <div className="text-[10px] text-gray-400 mt-1">{t.docs.brandCyanDesc}</div>
              </div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#ffcc00] shadow-[0_0_20px_rgba(255,204,0,0.3)]" />
              <div>
                <div className="font-bold text-white">{t.docs.brandAmber}</div>
                <div className="font-mono text-xs text-gray-500">#FFCC00</div>
                <div className="text-[10px] text-gray-400 mt-1">{t.docs.brandAmberDesc}</div>
              </div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#050505] border border-white/20" />
              <div>
                <div className="font-bold text-white">{t.docs.brandBlack}</div>
                <div className="font-mono text-xs text-gray-500">#050505</div>
                <div className="text-[10px] text-gray-400 mt-1">{t.docs.brandBlackDesc}</div>
              </div>
            </div>
          </div>
        </section> */}

        {/* FAQ / Talking Points */}
        <section>
          <SectionHeader title={t.docs.faqTitle} subtitle={t.docs.faqSubtitle} />
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass p-6 rounded-xl border border-white/5">
              <h3 className="font-bold text-white mb-2">{t.docs.faq1Q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.docs.faq1A}
              </p>
            </div>
            <div className="glass p-6 rounded-xl border border-white/5">
              <h3 className="font-bold text-white mb-2">{t.docs.faq2Q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.docs.faq2A}
              </p>
            </div>
            <div className="glass p-6 rounded-xl border border-white/5">
              <h3 className="font-bold text-white mb-2">{t.docs.faq3Q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.docs.faq3A}
              </p>
            </div>
            <div className="glass p-6 rounded-xl border border-white/5">
              <h3 className="font-bold text-white mb-2">{t.docs.faq4Q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t.docs.faq4A}
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default DocsPage;
