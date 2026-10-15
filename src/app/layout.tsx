import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

// Self-hosted (Fontsource 5.3.0 latin subsets, SIL OFL — see src/app/fonts/LICENSE-*). next/font/google
// downloads from Google during `next build`, which made CI/Vercel builds fail intermittently.
const display = localFont({
  src: [
    { path: './fonts/archivo-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/archivo-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});
const body = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Construction Ledger',
  description: 'Track expenses, diary entries, and budgets for your build.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f0' },
    { media: '(prefers-color-scheme: dark)', color: '#121417' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
