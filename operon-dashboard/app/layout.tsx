import type { Metadata } from 'next';
import { DM_Sans, DM_Mono, Be_Vietnam_Pro } from 'next/font/google';
import Providers from './providers';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

// R5-BUG-09: Vietnamese text on the EPP onboarding H1 was rendering the
// combining grave (U+0300) next to ê instead of the precomposed ề (the
// translation string is correctly NFC — verified via Python's
// unicodedata.is_normalized — but the serif fallback font used for the
// H1 lacks full Vietnamese diacritic coverage). DM Sans on
// `next/font/google` at this lockfile version only ships `latin` +
// `latin-ext` subsets, neither of which includes the Vietnamese block.
// Be Vietnam Pro is purpose-built for Vietnamese, covers every
// precomposed diacritic glyph, and ships `vietnamese` as a subset here.
// Exposed via CSS variable so the EPP page's `[data-lang="vi"]` override
// can target it without touching any other font rule.
const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-be-vietnam',
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'Operon Dashboard',
  description: 'Operon Network — Genesis Node Sale Dashboard',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable} ${beVietnamPro.variable} h-full`}>
      <body className="min-h-full bg-bg text-t1 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
