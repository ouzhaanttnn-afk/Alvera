import { auditLog } from '@/masak-raporu/server/admin';
import { ACTION_LABELS } from '@/masak-raporu/server/audit';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { Empty, PageHeader } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'Sistem aktiviteleri' };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string; olay?: string }> }) {
  const ctx = await requireCtx('audit.view');
  const sp = await searchParams;
  const d = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined);
  const rows = await auditLog(ctx, { from: d(sp.bas), to: d(sp.bit), action: sp.olay && /^[a-z_.]+$/.test(sp.olay) ? sp.olay : undefined });
  return (
    <>
      <PageHeader title="Sistem aktiviteleri (denetim izi)" back={{ href: '/masak-raporu/ayarlar', label: 'Ayarlar' }} description="Kayıtlar değiştirilemez ve hash zinciriyle birbirine bağlıdır. Kişisel veri içermez." />
      <form className="mr-card mb-3 flex flex-wrap items-end gap-2 p-3">
        <div><label className="mr-label" htmlFor="bas">Başlangıç</label><input className="mr-input" type="date" id="bas" name="bas" defaultValue={sp.bas} /></div>
        <div><label className="mr-label" htmlFor="bit">Bitiş</label><input className="mr-input" type="date" id="bit" name="bit" defaultValue={sp.bit} /></div>
        <div><label className="mr-label" htmlFor="olay">Olay</label><select className="mr-input" id="olay" name="olay" defaultValue={sp.olay || ''}><option value="">Tümü</option>{[...new Set(Object.keys(ACTION_LABELS).map((a) => a.split('.')[0]))].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <button className="mr-btn" type="submit">Filtrele</button>
      </form>
      {rows.length === 0 ? <Empty title="Kayıt yok" /> : (
        <div className="mr-card overflow-x-auto"><table className="mr-table">
          <thead><tr><th scope="col">#</th><th scope="col">Zaman</th><th scope="col">Olay</th><th scope="col">Kayıt</th><th scope="col">Kullanıcı</th><th scope="col">Hash</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={String(r.id)}><td className="mr-num">{String(r.id)}</td><td>{formatDateTime(r.created_at as Date)}</td><td>{ACTION_LABELS[String(r.action)] || String(r.action)}</td><td className="text-[12px]">{String(r.entity_type || '—')}</td><td>{String(r.full_name || 'Sistem')}</td><td className="font-mono text-[11px]">{String(r.hash).slice(0, 12)}…</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
