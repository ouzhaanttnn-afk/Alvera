import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './masak.css';

export const metadata: Metadata = {
  title: { default: 'ALVERA MASAK RAPORU', template: '%s · ALVERA MASAK RAPORU' },
  description: 'Alvera Kuyumculuk iç uyum kayıt ve denetim hazırlık paneli.',
  robots: { index: false, follow: false, nocache: true },
};

export default function MasakRaporuLayout({ children }: { children: ReactNode }) {
  return children;
}
