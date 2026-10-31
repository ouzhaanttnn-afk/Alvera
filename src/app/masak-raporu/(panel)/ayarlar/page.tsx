import Link from 'next/link';
import { integrations, organization, verifyAuditChain } from '@/masak-raporu/server/admin';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Card, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { retentionAction, updateOrgAction } from '../../actions';

export const metadata = { title: 'Ayarlar' };
const ENTITY: Record<string, string> = { customers: 'Müşteri ve kimlik kayıtları', transactions: 'İşlem kayıtları', documents: 'Belgeler', risk_cases: 'İç değerlendirmeler (ŞİB)', audit_events: 'Denetim izi', reports: 'Rapor kayıtları' };

export default async function Settings() {
  const ctx = await requireCtx('records.read');
  const { org, retention } = await organization(ctx);
  const chain = ctx.can('audit.view') ? await verifyAuditChain(ctx) : null;
  const manage = ctx.can('settings.manage');
  return (
    <>
      <PageHeader title="Mevzuat ve ayarlar" description="İşletme profili, veri saklama politikaları, sistem aktiviteleri ve entegrasyon durumları."
        actions={<><Link className="mr-btn" href="/masak-raporu/ayarlar/kurallar">Kurallar ve kaynaklar</Link><Link className="mr-btn" href="/masak-raporu/ayarlar/personel">Personel</Link>{ctx.can('audit.view') && <Link className="mr-btn" href="/masak-raporu/ayarlar/denetim-izi">Sistem aktiviteleri</Link>}</>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="İşletme profili">
          <ActionForm action={updateOrgAction} className="grid gap-2 sm:grid-cols-2">
            {[['name', 'Görünen ad'], ['legal_name', 'Ticari unvan'], ['tax_number', 'Vergi no'], ['phone', 'Telefon']].map(([k, l]) => (
              <div key={k}><label className="mr-label" htmlFor={k}>{l}</label><input className="mr-input" id={k} name={k} defaultValue={String(org[k] ?? '')} disabled={!manage} /></div>
            ))}
            <div className="sm:col-span-2"><label className="mr-label" htmlFor="address">Adres</label><input className="mr-input" id="address" name="address" defaultValue={String(org.address ?? '')} disabled={!manage} /></div>
            <p className="mr-hint sm:col-span-2">Plan: {String(org.plan)} · Durum: {String(org.status)} {org.is_demo ? '· DEMO' : ''}</p>
            {manage && <div><Submit>Kaydet</Submit></div>}
          </ActionForm>
        </Card>
        <Card title="Entegrasyon durumları">
          <ul className="space-y-2 text-[13px]">{integrations().map((i) => <li key={i.name} className="flex gap-2"><Badge tone={i.ok ? 'ok' : 'neutral'}>{i.ok ? 'Etkin' : 'Yok'}</Badge><span><strong>{i.name}:</strong> {i.status}</span></li>)}</ul>
          {chain && <p className="mt-3 text-[13px]">Denetim izi bütünlüğü: {chain.broken === 0 ? <Badge tone="ok">✓ {chain.total} kayıt, hash zinciri tutarlı</Badge> : <Badge tone="danger">{chain.broken} tutarsız kayıt</Badge>}</p>}
        </Card>
      </div>
      <Card title="Veri saklama politikaları" className="mt-4">
        <div className="mb-3"><Notice tone="warn">Süreler 5549 s. Kanun md. 8 (8 yıl) temel alınarak önerilmiştir. KVKK kapsamındaki saklama ve imha politikası ile birlikte <strong>hukuk incelemesinden geçmeden</strong> otomatik silme yapılmaz; süresi dolan kayıtlar yalnızca değerlendirme listesine alınır.</Notice></div>
        <div className="overflow-x-auto"><table className="mr-table">
          <thead><tr><th scope="col">Kayıt türü</th><th scope="col">Süre</th><th scope="col">Dayanak</th><th scope="col">Hukuk onayı</th>{manage && <th scope="col"><span className="mr-sr">Düzenle</span></th>}</tr></thead>
          <tbody>{retention.map((r) => (
            <tr key={String(r.id)}>
              <td>{ENTITY[String(r.entity_type)]}</td><td>{String(r.retention_years)} yıl</td><td className="max-w-[420px]">{String(r.basis)}</td>
              <td>{r.legal_review_status === 'approved' ? <Badge tone="ok">Onaylı · {String(r.approved_by_name)}</Badge> : <Badge tone="warn">Hukuki doğrulama gerekiyor</Badge>}<span className="mr-hint block">{formatDateTime(r.updated_at as Date)}</span></td>
              {manage && <td><details><summary className="text-[12.5px] font-semibold text-[#794c2b]">Düzenle</summary>
                <ActionForm action={retentionAction} className="mt-2 space-y-2">
                  <input type="hidden" name="entity" value={String(r.entity_type)} />
                  <div><label className="mr-label" htmlFor={`y-${r.id}`}>Yıl</label><input className="mr-input" id={`y-${r.id}`} name="years" type="number" min={1} max={50} defaultValue={String(r.retention_years)} /></div>
                  <div><label className="mr-label" htmlFor={`b-${r.id}`}>Dayanak</label><textarea className="mr-input" id={`b-${r.id}`} name="basis" defaultValue={String(r.basis)} rows={2} /></div>
                  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="approve" className="accent-[#794c2b]" /> Hukuk incelemesi tamamlandı</label>
                  <Submit variant="default">Kaydet</Submit>
                </ActionForm></details></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="Yedekleme, veri konumu ve yetki politikası" className="mt-4">
        <ul className="list-disc space-y-1 pl-5 text-[13px]">
          <li>Üretimde veriler Supabase Postgres ve özel Storage kovasında tutulur; bölge seçimi ve yurt dışı aktarım için KVKK md. 9 (standart sözleşme ve Kurul&apos;a bildirim) değerlendirmesi gerekir. Ayrıntı: <code>docs/masak-raporu/GUVENLIK-KVKK.md</code>.</li>
          <li>Yedekleme ve geri yükleme prosedürü: <code>docs/masak-raporu/URETIM.md</code>. Belge dosyaları uygulama anahtarıyla şifrelidir; anahtar yedeği ayrı ve güvenli saklanmalıdır.</li>
          <li>Yetkiler hem uygulamada hem veritabanında (satır düzeyi güvenlik) uygulanır; rol matrisi <Link className="underline" href="/masak-raporu/ayarlar/personel">Personel</Link> sayfasındadır.</li>
        </ul>
      </Card>
    </>
  );
}
