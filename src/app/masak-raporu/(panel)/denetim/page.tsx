import { requireCtx } from '@/masak-raporu/server/session';
import { istanbulDate } from '@/masak-raporu/dates';
import { Card, NotOfficial, Notice, PageHeader } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'Denetim hazırlık merkezi' };

export default async function AuditCenter() {
  const ctx = await requireCtx('export.data');
  const today = istanbulDate(new Date());
  return (
    <>
      <PageHeader title="Denetim hazırlık merkezi" description="Seçilen dönem için raporları, veri dosyalarını, belge envanterini ve kayıt değişiklik geçmişini tek bir ZIP paketinde toplar. Her dosyanın SHA-256 özeti manifest.json'da yer alır." />
      <div className="mb-4 space-y-2">
        <NotOfficial />
        <Notice>Paket yalnızca sizin açık işleminizle üretilir ve oluşturulması denetim izine yazılır. İçerik rolünüze göre sınırlanır: gizli iç değerlendirmeler yalnızca yetkili kullanıcı açıkça isterse eklenir.</Notice>
      </div>
      <Card title="Paket oluştur">
        <form method="post" action="/api/masak-raporu/denetim" className="grid max-w-[640px] gap-3 sm:grid-cols-2">
          <div><label className="mr-label" htmlFor="from">Başlangıç</label><input className="mr-input" type="date" id="from" name="from" defaultValue={`${today.slice(0, 5)}01-01`} required /></div>
          <div><label className="mr-label" htmlFor="to">Bitiş</label><input className="mr-input" type="date" id="to" name="to" defaultValue={today} required /></div>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] sm:col-span-2">
            <li>Dönemdeki işlemler ve uyarılar toplanır (CSV).</li>
            <li>Eksik müşteri doğrulamaları ve açık kontroller raporlanır (E raporu).</li>
            <li>Bağlantı değerlendirmeleri (F), müşteri teyit özeti (A) ve denetim hazırlık özeti (G) eklenir.</li>
            <li>{ctx.can('audit.view') ? 'Yetki ve işlem geçmişi (I), denetim izi ve kayıt değişiklikleri (kim, ne zaman) eklenir.' : 'Denetim izi rolünüz gereği eklenmez.'}</li>
            <li>Belge envanteri; isterseniz belge kopyaları eklenir.</li>
            <li>manifest.json ve manifest.sha256 ile bütünlük özetleri oluşturulur.</li>
          </ol>
          {ctx.can('documents.download') && <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="include_documents" className="mt-1 accent-[#794c2b]" /> Belge kopyalarını pakete ekle (her belge erişimi kayıt altına alınır)</label>}
          {ctx.can('reports.confidential') && ctx.can('cases.view') && <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="include_confidential" className="mt-1 accent-[#794c2b]" /> Gizli iç değerlendirmeleri (H raporu) ekle — yalnızca yetkili denetim elemanı/mahkeme talebi için</label>}
          <div className="sm:col-span-2"><button className="mr-btn mr-btn-primary" type="submit">ZIP paketini oluştur ve indir</button></div>
        </form>
      </Card>
    </>
  );
}
