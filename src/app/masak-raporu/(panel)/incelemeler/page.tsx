import Link from 'next/link';
import { CASE_STATUS, listCases, REASONS } from '@/masak-raporu/server/cases';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { Badge, Empty, NotOfficial, PageHeader } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'İç değerlendirme merkezi' };

export default async function Cases({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const ctx = await requireCtx('cases.view');
  const { durum } = await searchParams;
  const rows = await listCases(ctx, durum && durum in CASE_STATUS ? durum : '');
  const now = Date.now();
  return (
    <>
      <PageHeader title="Şüpheli işlem iç değerlendirme merkezi" description="Gizli kayıtlar. Yalnızca İşletme Sahibi ve Uyum Yetkilisi görür." actions={<Link className="mr-btn mr-btn-primary" href="/masak-raporu/incelemeler/yeni">Yeni kayıt</Link>} />
      <div className="mb-4"><NotOfficial /></div>
      <form className="mb-3 flex items-end gap-2" aria-label="Durum filtresi">
        <div><label className="mr-label" htmlFor="durum">Durum</label><select className="mr-input" id="durum" name="durum" defaultValue={durum || ''}><option value="">Tümü</option>{Object.entries(CASE_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <button className="mr-btn" type="submit">Filtrele</button>
      </form>
      {rows.length === 0 ? <Empty title="Kayıt yok" /> : (
        <div className="mr-card overflow-x-auto">
          <table className="mr-table">
            <thead><tr><th scope="col">No</th><th scope="col">Başlık</th><th scope="col">Neden</th><th scope="col">Durum</th><th scope="col">Şüphe zamanı</th><th scope="col">İç takip son tarihi</th><th scope="col">Sorumlu</th><th scope="col" className="mr-num">İşlem</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const due = new Date(c.due_at as string).getTime();
                const active = !['closed', 'reported_externally'].includes(String(c.status));
                return (
                  <tr key={String(c.id)}>
                    <td><Link className="font-semibold text-[#794c2b] hover:underline" href={`/masak-raporu/incelemeler/${c.id}`}>{String(c.number)}</Link></td>
                    <td>{String(c.title)}</td>
                    <td>{REASONS[c.reason_category as keyof typeof REASONS]}</td>
                    <td><Badge>{CASE_STATUS[c.status as keyof typeof CASE_STATUS]}</Badge></td>
                    <td>{formatDateTime(c.suspicion_at as Date)}</td>
                    <td>{formatDateTime(c.due_at as Date)} {active && due < now ? <Badge tone="danger">Süre geçti</Badge> : active && due - now < 3 * 86_400_000 ? <Badge tone="warn">3 günden az</Badge> : null}</td>
                    <td>{String(c.assigned_name || '—')}</td>
                    <td className="mr-num">{String(c.tx_count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
