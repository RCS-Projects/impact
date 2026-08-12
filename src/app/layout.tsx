import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Impact System',
  description: 'Crowdsourced incident maps for Canadian communities.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
