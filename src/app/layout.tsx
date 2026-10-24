import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Alvera Kuyumculuk | MASAK Form',
  description: 'Alvera Form müşteri başvuru ve yönetim sistemi.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <a href="#main-content" className="skip-link">
          İçeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
