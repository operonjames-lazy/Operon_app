
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONNECT_URL } from '../constants';

interface NavbarProps {
  currentLang: string;
  setLang: (lang: string) => void;
  currentPage: 'home' | 'agents' | 'nodes' | 'docs' | 'faq';
  onNavigate: (page: 'home' | 'agents' | 'nodes' | 'docs' | 'faq', section?: string) => void;
  t: any;
}

const languages = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh-CN', label: '简', name: '简体中文' },
  { code: 'zh-TW', label: '繁', name: '繁體中文' },
  { code: 'ko', label: 'KR', name: '한국어' },
  { code: 'ja', label: 'JP', name: '日本語' },
  { code: 'th', label: 'TH', name: 'ไทย' },
  { code: 'vi', label: 'VN', name: 'Tiếng Việt' },
];

const Navbar: React.FC<NavbarProps> = ({ currentLang, setLang, currentPage, onNavigate, t }) => {
  const [scrolled, setScrolled] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const currentLangObj = languages.find(l => l.code === currentLang) || languages[0];

  const handleLinkClick = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    onNavigate('home', sectionId);
  };

  const handlePageNavigate = (page: 'home' | 'agents' | 'nodes' | 'docs') => {
    setIsMobileMenuOpen(false);
    onNavigate(page);
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#05080F]/90 backdrop-blur-xl border-b border-white/5 py-4' : 'bg-transparent py-6 md:py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          {/* Logo */}
          <div 
            className="flex items-center gap-2 group cursor-pointer relative z-50" 
            onClick={() => handlePageNavigate('home')}
          >
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: '22px', letterSpacing: '0.02em', lineHeight: 1 }} className="text-[#F8FAFF]">OPER<span className="text-[#93C5FD]">ON</span></span>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center gap-8">
            <button onClick={(e) => handleLinkClick(e, 'problem')} className="text-xs font-mono font-medium uppercase tracking-[0.15em] text-[#5A6A82] hover:text-white transition-colors">{t.navGap}</button>
            <button 
              onClick={() => onNavigate('agents')} 
              className={`text-xs font-mono font-medium uppercase tracking-[0.15em] transition-colors ${currentPage === 'agents' ? 'text-[#06B6D4]' : 'text-[#5A6A82] hover:text-white'}`}
            >
              {t.navAgents}
            </button>
            
            {/* Operon Node Link */}
            <button 
              onClick={() => onNavigate('nodes')} 
              className={`relative group text-xs font-mono font-bold uppercase tracking-[0.15em] transition-all duration-300 flex items-center gap-2 px-5 py-2.5 rounded-lg border ${
                currentPage === 'nodes' 
                  ? 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B] shadow-[0_0_30px_rgba(245,158,11,0.4)]' 
                  : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/50 hover:bg-[#F59E0B]/20 hover:border-[#F59E0B] hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]'
              }`}
            >
              <span className="absolute inset-0 rounded-lg bg-[#F59E0B]/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className={`relative z-10 w-2 h-2 rounded-full ${currentPage === 'nodes' ? 'bg-[#F59E0B]' : 'bg-[#F59E0B]'} animate-pulse shadow-[0_0_10px_#F59E0B]`} />
              <span className="relative z-10">{t.navNodes}</span>
            </button>

            {/* Docs Link */}
            <button 
              onClick={() => onNavigate('docs')} 
              className={`text-xs font-mono font-medium uppercase tracking-[0.15em] transition-colors ${currentPage === 'docs' ? 'text-[#06B6D4]' : 'text-[#5A6A82] hover:text-white'}`}
            >
              {t.navDocs}
            </button>

            {/* FAQ Link */}
            <a
              href="/faq/"
              onClick={() => { const l = currentLang; localStorage.setItem('operon-faq-lang', l.toLowerCase()); localStorage.setItem('opn301-lang', l); localStorage.setItem('showcase_lang', l); }}
              className="text-xs font-mono font-medium uppercase tracking-[0.15em] transition-colors text-[#5A6A82] hover:text-white"
            >
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-6 relative z-50">
             {/* Language Selector */}
            <div className="relative">
              <button 
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-widest text-[#5A6A82] hover:text-white transition-colors"
              >
                <span>{currentLangObj.label}</span>
                <svg className={`w-3 h-3 transition-transform ${isLangOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              
              <AnimatePresence>
                {isLangOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-4 w-32 bg-[#0A0F1C] border border-white/10 rounded-lg overflow-hidden shadow-xl"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLang(lang.code);
                          setIsLangOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-xs font-mono hover:bg-white/5 transition-colors ${currentLang === lang.code ? 'text-[#06B6D4]' : 'text-[#5A6A82]'}`}
                      >
                        <span className="mr-2 uppercase text-[10px] tracking-wider opacity-50">{lang.label}</span>
                        {lang.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* CTA Button (Desktop) */}
            <a
              href={CONNECT_URL}
              className="hidden lg:block group relative bg-[#06B6D4]/10 border border-[#06B6D4]/25 text-[#06B6D4] px-5 py-2 rounded-md text-xs font-mono uppercase tracking-widest overflow-hidden transition-all hover:bg-[#06B6D4]/20 hover:border-[#06B6D4]/50"
            >
              <span className="relative z-10 block">{t.navLaunch}</span>
            </a>

            {/* Mobile Hamburger */}
            <button 
              className="lg:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <motion.div 
                animate={{ rotate: isMobileMenuOpen ? 45 : 0, y: isMobileMenuOpen ? 6 : 0 }} 
                className="w-6 h-0.5 bg-white origin-center" 
              />
              <motion.div 
                animate={{ opacity: isMobileMenuOpen ? 0 : 1 }} 
                className="w-6 h-0.5 bg-white" 
              />
              <motion.div 
                animate={{ rotate: isMobileMenuOpen ? -45 : 0, y: isMobileMenuOpen ? -6 : 0 }} 
                className="w-6 h-0.5 bg-white origin-center" 
              />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center space-y-8 lg:hidden"
          >
             <button onClick={(e) => handleLinkClick(e, 'problem')} className="text-xl font-black uppercase tracking-widest text-white">{t.navGap}</button>
             <button onClick={() => handlePageNavigate('agents')} className={`text-xl font-black uppercase tracking-widest ${currentPage === 'agents' ? 'text-[#00f2ff]' : 'text-white'}`}>{t.navAgents}</button>
             <button onClick={() => handlePageNavigate('nodes')} className={`text-xl font-black uppercase tracking-widest ${currentPage === 'nodes' ? 'text-[#ffcc00]' : 'text-[#ffcc00]/80'}`}>{t.navNodes}</button>
             <button onClick={() => handlePageNavigate('docs')} className={`text-xl font-black uppercase tracking-widest ${currentPage === 'docs' ? 'text-[#00f2ff]' : 'text-white'}`}>{t.navDocs}</button>
             <a href="/faq/" onClick={() => { const l = currentLang; localStorage.setItem('operon-faq-lang', l.toLowerCase()); localStorage.setItem('opn301-lang', l); localStorage.setItem('showcase_lang', l); }} className="text-xl font-black uppercase tracking-widest text-white">FAQ</a>
             <div className="w-16 h-[1px] bg-white/10" />
             
             <a href={CONNECT_URL} className="mt-8 bg-[#00f2ff] text-black px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest">
                {t.navLaunch}
             </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
