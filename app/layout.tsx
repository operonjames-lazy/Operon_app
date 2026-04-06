import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
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
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable} h-full`}>
      <body className="min-h-full bg-bg text-t1 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
