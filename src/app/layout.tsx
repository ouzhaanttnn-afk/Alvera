import type { Metadata } from 'next';
import './globals.css';
import './glass.css';
export const metadata: Metadata = {
  title: 'Alvera Kuyumculuk | MASAK Form',
  description: 'Alvera Form müşteri başvuru ve yönetim sistemi.',
  robots: { index: false, follow: false },
  icons: { icon: { url: '/assets/alvera-monogram.svg', type: 'image/svg+xml' } },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <div className="liquid-backdrop" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <a href="#main-content" className="skip-link">
          İçeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
