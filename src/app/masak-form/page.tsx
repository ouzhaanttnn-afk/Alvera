import Link from 'next/link';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ApplicationForm } from '@/components/application-form';
import { pageConfiguration } from '@/lib/config';
export const dynamic = 'force-dynamic';
export default function Page() {
  try {
    const { policy, notice } = pageConfiguration();
    return (
      <>
        <header className="site-header">
          <Brand />
          <div className="header-links">
            <span>
              <ShieldCheck size={16} /> MASAK Form
            </span>
            <Link href="/masak-form/admin">
              Yönetim paneli <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>
        {policy.local && (
          <div className="dev-banner">
            Geliştirme ortamı · Yalnızca sentetik veri kullanın. Gerçek e-posta gönderimi kapalıdır.
          </div>
        )}
        {policy.previewOnly && (
          <div className="dev-banner">
            Form önizlemesi · Yalnızca sentetik veri kullanın. Başvuru gönderimi ve e-posta
            kapalıdır.
          </div>
        )}
        <div id="main-content">
          <ApplicationForm policy={policy} notice={notice} />
        </div>
        <footer className="site-footer">
          <span>© {new Date().getFullYear()} Alvera Form</span>
          <span>Özenle tasarlandı. Güvenle ilerleyin.</span>
          <Link href="/masak-form/privacy">
            Gizlilik ve aydınlatma <ArrowUpRight size={12} />
          </Link>
        </footer>
      </>
    );
  } catch {
    return (
      <main className="unavailable" id="main-content"><Brand />
        <ShieldCheck size={36} />
        <h1>Başvurular henüz açılmadı.</h1>
        <p>Güvenli kullanım için gerekli yapılandırmalar tamamlanıyor.</p>
      </main>
    );
  }
}
