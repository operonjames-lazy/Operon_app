import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Unbounded, Be_Vietnam_Pro } from 'next/font/google';
import Providers from './providers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const unbounded = Unbounded({
  variable: '--font-unbounded',
  subsets: ['latin'],
  weight: ['300', '600', '700', '800'],
});

// R5-BUG-09: Vietnamese text on the EPP onboarding H1 was rendering the
// combining grave (U+0300) next to ê instead of the precomposed ề (the
// translation string is correctly NFC — verified via Python's
// unicodedata.is_normalized — but the serif fallback font used for the
// H1 lacks full Vietnamese diacritic coverage). Inter on
// `next/font/google` at this lockfile version ships latin + latin-ext
// only. Be Vietnam Pro is purpose-built for Vietnamese, covers every
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
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${unbounded.variable} ${beVietnamPro.variable} h-full`}>
      <body className="min-h-full bg-bg text-t1 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
