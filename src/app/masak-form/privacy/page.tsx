import { Brand } from '@/components/brand';
import { privacyNotice } from '@/lib/config';
export const dynamic = 'force-dynamic';
export default function Privacy() {
  let notice = 'Aydınlatma metni henüz yayımlanmadı. Gerçek kişisel veri göndermeyin.';
  try {
    notice = privacyNotice();
  } catch {}
  return (
    <>
      <header className="site-header">
        <Brand />
        <a href="/masak-form">Başvuruya dön</a>
      </header>
      <main id="main-content" className="privacy-page">
        <span className="eyebrow">GİZLİLİK</span>
        <h1>Aydınlatma metni</h1>
        <p className="privacy-text">{notice}</p>
      </main>
    </>
  );
}
