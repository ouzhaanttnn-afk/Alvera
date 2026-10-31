import Link from 'next/link';
import { requireCtx } from '@/masak-raporu/server/session';
import { listTransactions, TX_STATUS, TX_TYPES } from '@/masak-raporu/server/transactions';
import { formatDateTime } from '@/masak-raporu/dates';
import { Badge, Empty, Money, PageHeader, Pager, queryString } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'İşlemler' };

export default async function Transactions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined);
  const rows = await listTransactions(ctx, { from: date(sp.bas), to: date(sp.bit), type: sp.tur, status: sp.durum, customer: sp.musteri, q: sp.q, page, alerts: sp.uyari });
  return (
    <>
      <PageHeader title="İşlemler" description="Tamamlanan işlemler değiştirilemez; iptal veya düzeltme kaydı oluşturulur ve geçmiş korunur."
        actions={ctx.can('records.write') && <><Link className="mr-btn" href="/masak-raporu/islemler/ice-aktar">CSV içe aktar</Link><Link className="mr-btn mr-btn-primary" href="/masak-raporu/islemler/yeni">Yeni işlem</Link></>} />
      <form className="mr-card mb-3 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-7 lg:items-end" aria-label="İşlem filtreleri">
        <div className="lg:col-span-2"><label className="mr-label" htmlFor="q">İşlem/fiş no veya müşteri</label><input className="mr-input" id="q" name="q" defaultValue={sp.q} /></div>
        <div><label className="mr-label" htmlFor="bas">Başlangıç</label><input className="mr-input" type="date" id="bas" name="bas" defaultValue={sp.bas} /></div>
        <div><label className="mr-label" htmlFor="bit">Bitiş</label><input className="mr-input" type="date" id="bit" name="bit" defaultValue={sp.bit} /></div>
        <div><label className="mr-label" htmlFor="tur">Tür</label><select className="mr-input" id="tur" name="tur" defaultValue={sp.tur || ''}><option value="">Tümü</option>{Object.entries(TX_TYPES).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><label className="mr-label" htmlFor="durum">Durum</label><select className="mr-input" id="durum" name="durum" defaultValue={sp.durum || ''}><option value="">Tümü</option>{Object.entries(TX_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><label className="mr-label" htmlFor="uyari">Açık uyarı</label><select className="mr-input" id="uyari" name="uyari" defaultValue={sp.uyari || ''}><option value="">Fark etmez</option><option value="any">Var</option><option value="high">Yüksek öncelik</option><option value="review">İnceleme gerekli</option></select></div>
        <div className="lg:col-span-7"><button className="mr-btn" type="submit">Filtrele</button> <Link className="mr-btn" href="/masak-raporu/islemler">Temizle</Link></div>
      </form>
      {rows.length === 0 ? <Empty title="İşlem bulunamadı">Filtreleri değiştirin veya yeni işlem ekleyin.</Empty> : (
        <div className="mr-card overflow-x-auto">
          <table className="mr-table">
            <thead><tr><th scope="col">İşlem no</th><th scope="col">Tarih</th><th scope="col">Müşteri</th><th scope="col">Tür</th><th scope="col" className="mr-num">TL tutar</th><th scope="col">Durum</th><th scope="col">Uyarı</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={String(t.id)}>
                  <td><Link className="font-semibold text-[#794c2b] hover:underline" href={`/masak-raporu/islemler/${t.id}`}>{String(t.number)}</Link> {Boolean(t.is_demo) && <Badge tone="demo">DEMO</Badge>}</td>
                  <td>{formatDateTime(t.occurred_at as Date)}</td>
                  <td><Link className="hover:underline" href={`/masak-raporu/musteriler/${t.customer_id}`}>{String(t.customer_name)}</Link></td>
                  <td>{TX_TYPES[t.type as keyof typeof TX_TYPES]}</td>
                  <td className="mr-num"><Money kurus={t.total_try_kurus} /></td>
                  <td>{t.status === 'completed' ? 'Tamamlandı' : <Badge tone={t.status === 'draft' ? 'neutral' : 'warn'}>{TX_STATUS[t.status as keyof typeof TX_STATUS]}</Badge>}</td>
                  <td>{t.alert_rank === 3 ? <Badge tone="danger">▲ Yüksek</Badge> : t.alert_rank === 2 ? <Badge tone="warn">! İnceleme</Badge> : t.alert_rank === 1 ? <Badge>ℹ Bilgi</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} hasMore={rows.length === 100} base={`/masak-raporu/islemler${queryString({ q: sp.q, bas: sp.bas, bit: sp.bit, tur: sp.tur, durum: sp.durum, uyari: sp.uyari, musteri: sp.musteri })}`} />
    </>
  );
}
