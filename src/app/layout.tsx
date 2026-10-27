import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import { Footer, Header, Providers } from '@/components/shell';
import './globals.css';

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Kept: find out if your skincare is actually working',
    template: '%s | Kept',
  },
  description:
    'Kept photographs your skin the same way at every check-in, measures it with YouCam Skin AI and tells you when a product deserves a place on your shelf.',
  applicationName: 'Kept',
  icons: {
    icon: [{ url: '/brand/mark.svg', type: 'image/svg+xml' }],
    shortcut: '/brand/mark.svg',
    apple: '/brand/mark.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#F8F4EF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={onest.variable}>
      <body>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <Header />
          <div id="content" className="shell-content">
            {children}
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
