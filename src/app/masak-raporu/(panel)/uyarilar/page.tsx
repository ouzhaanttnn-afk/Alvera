import Link from 'next/link';
import { ALERT_STATUS, listAlerts } from '@/masak-raporu/server/alerts';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { LEVEL_LABELS, type Level } from '@/masak-raporu/rules/engine';
import { AlertReview } from '@/masak-raporu/ui/alert-review';
import { Badge, Empty, LevelBadge, PageHeader } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'Kural uyarıları' };

export default async function Alerts({ searchParams }: { searchParams: Promise<{ durum?: string; seviye?: string; kural?: string }> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const status = sp.durum === undefined ? 'open' : sp.durum;
  const rows = await listAlerts(ctx, { status, level: sp.seviye, rule: sp.kural });
  return (
    <>
      <PageHeader title="Kural uyarıları" description="Her uyarı gerekçesini, uygulanan kural versiyonunu ve mevzuat kaynağını gösterir. Uyarı bir hukuki sonuç değildir; eşik üstü işlem kendiliğinden MASAK bildirimi gerektirmez. Değerlendirme yetkili kişiye aittir." />
      <form className="mr-card mb-3 flex flex-wrap items-end gap-2 p-3" aria-label="Uyarı filtreleri">
        <div><label className="mr-label" htmlFor="durum">Durum</label><select className="mr-input" id="durum" name="durum" defaultValue={status}><option value="">Tümü</option>{Object.entries(ALERT_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><label className="mr-label" htmlFor="seviye">Seviye</label><select className="mr-input" id="seviye" name="seviye" defaultValue={sp.seviye || ''}><option value="">Tümü</option>{Object.entries(LEVEL_LABELS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><label className="mr-label" htmlFor="kural">Kural</label><input className="mr-input" id="kural" name="kural" defaultValue={sp.kural} placeholder="Örn. KT-ESIK" /></div>
        <button className="mr-btn" type="submit">Filtrele</button>
      </form>
      {rows.length === 0 ? <Empty title="Uyarı yok" /> : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={String(a.id)} className="mr-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <LevelBadge level={a.level as Level} /><strong>{String(a.title)}</strong>
                <Badge>{ALERT_STATUS[a.status as keyof typeof ALERT_STATUS]}</Badge>{Boolean(a.confidential) && <Badge tone="danger">Gizli</Badge>}
                <span className="mr-hint ml-auto">{formatDateTime(a.created_at as Date)}</span>
              </div>
              <p className="mt-1 text-[13.5px]">{String(a.rationale)}</p>
              <p className="mr-hint mt-1">
                {a.transaction_id ? <Link className="underline" href={`/masak-raporu/islemler/${a.transaction_id}`}>{String(a.transaction_number)}</Link> : null}
                {a.customer_name ? <> · <Link className="underline" href={`/masak-raporu/musteriler/${a.customer_id}`}>{String(a.customer_name)}</Link></> : null}
                {' · '}Kural {String(a.rule_key)} v{String(a.rule_version)} · <a className="underline" href={String(a.source_url)} target="_blank" rel="noopener noreferrer">{String(a.source_article)}</a>
              </p>
              {ctx.can('alerts.review') && <AlertReview id={String(a.id)} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
