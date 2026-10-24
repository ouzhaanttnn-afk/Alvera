import { Admin } from '@/components/admin';
import { config } from '@/lib/config';
export const dynamic = 'force-dynamic';
export default function AdminPage() {
  try {
    return <Admin local={config('admin').local} />;
  } catch {
    return (
      <main className="unavailable" id="main-content">
        <h1>Yönetim henüz açılmadı.</h1>
        <p>Güvenlik yapılandırmaları tamamlanmalıdır.</p>
      </main>
    );
  }
}
