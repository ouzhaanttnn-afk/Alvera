import Link from 'next/link';
import { listCustomers } from '@/masak-raporu/server/customers';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDate } from '@/masak-raporu/dates';
import { Badge, Empty, PageHeader, Pager, queryString } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'Müşteriler' };

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const rows = await listCustomers(ctx, { q: sp.q, kind: sp.tur, risk: sp.risk, page });
  return (
    <>
      <PageHeader title="Müşteriler (KYC)" description="Kimlik numaraları şifreli saklanır, listede maskeli görünür. Kimlik/vergi numarasıyla tam eşleşme araması yapılabilir."
        actions={ctx.can('records.write') && <Link className="mr-btn mr-btn-primary" href="/masak-raporu/musteriler/yeni">Yeni müşteri</Link>} />
      <form className="mr-card mb-3 flex flex-wrap items-end gap-2 p-3" aria-label="Müşteri filtreleri">
        <div className="min-w-[220px] flex-1"><label className="mr-label" htmlFor="q">Ad, unvan veya kimlik/vergi no</label><input className="mr-input" id="q" name="q" defaultValue={sp.q} /></div>
        <div><label className="mr-label" htmlFor="tur">Tip</label><select className="mr-input" id="tur" name="tur" defaultValue={sp.tur || ''}><option value="">Tümü</option><option value="natural">Gerçek kişi</option><option value="legal">Tüzel kişi</option></select></div>
        <div><label className="mr-label" htmlFor="risk">Risk</label><select className="mr-input" id="risk" name="risk" defaultValue={sp.risk || ''}><option value="">Tümü</option><option value="low">Düşük</option><option value="standard">Standart</option><option value="high">Yüksek</option></select></div>
        <button className="mr-btn" type="submit">Filtrele</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Müşteri bulunamadı">Filtreleri değiştirin veya yeni müşteri ekleyin.</Empty>
      ) : (
        <div className="mr-card overflow-x-auto">
          <table className="mr-table">
            <thead><tr><th scope="col">Müşteri</th><th scope="col">Tip</th><th scope="col">Kimlik / VKN</th><th scope="col">Teyit</th><th scope="col">Risk</th><th scope="col" className="mr-num">İşlem</th><th scope="col">Son işlem</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link className="font-semibold text-[#794c2b] hover:underline" href={`/masak-raporu/musteriler/${c.id}`}>{c.display_name}</Link> {c.is_demo && <Badge tone="demo">DEMO</Badge>}</td>
                  <td>{c.kind === 'legal' ? 'Tüzel' : 'Gerçek'}</td>
                  <td className="font-mono text-[12px]">{c.identity_masked || c.tax_masked || '—'}</td>
                  <td>{c.verified ? <Badge tone="ok">✓ Doğrulandı</Badge> : <Badge tone="warn">Teyit yok</Badge>}</td>
                  <td>{c.risk_level === 'high' ? <Badge tone="danger">Yüksek</Badge> : c.risk_level === 'low' ? 'Düşük' : 'Standart'}</td>
                  <td className="mr-num">{c.tx_count}</td>
                  <td>{formatDate(c.last_tx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} hasMore={rows.length === 50} base={`/masak-raporu/musteriler${queryString({ q: sp.q, tur: sp.tur, risk: sp.risk })}`} />
    </>
  );
}
