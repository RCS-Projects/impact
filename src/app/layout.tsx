import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: { default: 'Impact Maps', template: '%s · Impact Maps' },
  description:
    'Community crowdsourced incident maps. Reports are crowdsourced and may not be independently verified.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
