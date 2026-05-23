import './globals.css';

import type { Metadata } from 'next';
import Script from 'next/script';

import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'Instagram Lead Refinement',
  description:
    'Upload Instagram scraped CSV/XLSX, auto-clean, extract emails, detect country & category, and push CRM-ready leads.',
};

// Runs before React hydrates so the correct theme is applied without a flash.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored ? stored === 'dark' : prefersDark;
    var root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
