import { DOCUMENT_KINDS, listDocuments } from '@/masak-raporu/server/documents';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Empty, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { deletionReviewAction } from '../../actions';

export const metadata = { title: 'Belge arşivi' };

export default async function Documents({ searchParams }: { searchParams: Promise<{ q?: string; tur?: string }> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const rows = await listDocuments(ctx, { q: sp.q, kind: sp.tur });
  return (
    <>
      <PageHeader title="Güvenli belge arşivi" description="Belgeler özel depoda, uygulama katmanında şifreli ve tahmin edilemez adlarla saklanır. İndirme, rol izni ve veritabanı kontrolünden geçer; her erişim denetim izine yazılır." />
      <div className="mb-4"><Notice>Belgeler doğrudan silinmez. Silme değerlendirme talebi, yasal saklama süreleri (5549 s. Kanun md. 8: 8 yıl) ve istisnalar incelendikten sonra yetkili kişi tarafından sonuçlandırılır. Yeni versiyon yüklendiğinde eskisi korunur.</Notice></div>
      <form className="mr-card mb-3 flex flex-wrap items-end gap-2 p-3" aria-label="Belge filtreleri">
        <div className="min-w-[220px] flex-1"><label className="mr-label" htmlFor="q">Başlık, müşteri veya işlem no</label><input className="mr-input" id="q" name="q" defaultValue={sp.q} /></div>
        <div><label className="mr-label" htmlFor="tur">Tür</label><select className="mr-input" id="tur" name="tur" defaultValue={sp.tur || ''}><option value="">Tümü</option>{Object.entries(DOCUMENT_KINDS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <button className="mr-btn" type="submit">Filtrele</button>
      </form>
      {rows.length === 0 ? <Empty title="Belge yok">Belgeler müşteri, işlem veya iç inceleme sayfasından yüklenir.</Empty> : (
        <div className="mr-card overflow-x-auto">
          <table className="mr-table">
            <thead><tr><th scope="col">Belge</th><th scope="col">Tür</th><th scope="col">İlişki</th><th scope="col">Versiyon</th><th scope="col">Yükleyen</th><th scope="col">Bütünlük (SHA-256)</th><th scope="col">Saklama</th><th scope="col"><span className="mr-sr">İşlemler</span></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={String(d.id)}>
                  <td>{String(d.title)} {Boolean(d.confidential) && <Badge tone="danger">Gizli</Badge>}</td>
                  <td>{DOCUMENT_KINDS[d.kind as keyof typeof DOCUMENT_KINDS]}</td>
                  <td>{[d.customer_name, d.transaction_number].filter(Boolean).join(' · ') || '—'}</td>
                  <td>v{String(d.version)} {Boolean(d.superseded) && <Badge>Eski</Badge>}</td>
                  <td>{String(d.uploaded_by_name)}<span className="mr-hint block">{formatDateTime(d.created_at as Date)}</span></td>
                  <td className="font-mono text-[11px]">{String(d.sha256).slice(0, 16)}…</td>
                  <td>{d.legal_hold ? <Badge tone="warn">Yasal tutma</Badge> : d.deletion_status === 'none' ? 'Politika' : <Badge>Silme değerlendirmesi</Badge>}</td>
                  <td className="whitespace-nowrap">
                    {ctx.can('documents.download') && <a className="mr-btn" href={`/api/masak-raporu/belge/${d.id}`}>İndir</a>}
                    {ctx.can('documents.upload') && d.deletion_status === 'none' && !d.legal_hold && (
                      <ActionForm action={deletionReviewAction} className="mt-1"><input type="hidden" name="id" value={String(d.id)} /><Submit variant="default">Silme değerlendirmesi iste</Submit></ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
