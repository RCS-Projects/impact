import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: { default: 'Impact Maps', template: '%s · Impact Maps' },
  description:
    'Community crowdsourced incident maps. Reports are crowdsourced and may not be independently verified.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d1215',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
