import { CSV_EXPORTS, REPORTS, canGenerate, type ReportCode } from '@/masak-raporu/server/reports';
import { requireCtx } from '@/masak-raporu/server/session';
import { TX_STATUS, TX_TYPES } from '@/masak-raporu/server/transactions';
import { formatDateTime, istanbulDate } from '@/masak-raporu/dates';
import { Badge, Card, NotOfficial, PageHeader } from '@/masak-raporu/ui/ui';
import { customerOptions } from '@/masak-raporu/server/customers';

export const metadata = { title: 'Rapor merkezi' };

export default async function Reports() {
  const ctx = await requireCtx('export.data');
  const today = istanbulDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const customers = await customerOptions(ctx);
  const recent = await ctx.db((sql) => sql.query<Record<string, unknown>>(
    `select r.reference, r.report_type, r.format, r.created_at, r.sha256, r.record_count, r.confidential, p.full_name from masak.report_exports r
       left join masak.profiles p on p.id = r.created_by where r.organization_id = $1 order by r.created_at desc limit 20`, [ctx.org.organizationId]));
  return (
    <>
      <PageHeader title="ALVERA MASAK Rapor Merkezi" description="Raporlar ALVERA KUYUMCULUK başlığı, referans numarası, hazırlayan, kapsam ve sayfa numarasıyla üretilir. Kaynak kayıtların versiyonları ve dosya özeti (SHA-256) saklanır." />
      <div className="mb-4"><NotOfficial /></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(Object.keys(REPORTS) as ReportCode[]).map((code) => {
          const r = REPORTS[code];
          const allowed = canGenerate(ctx, code);
          return (
            <Card key={code} title={<span className="flex items-center gap-2">{code}) {r.title} {r.confidential && <Badge tone="danger">Gizli</Badge>}</span>}>
              <p className="mb-3 text-[13px] text-[#5f4d40]">{r.description}</p>
              {!allowed ? <p className="mr-hint">Bu rapor için rolünüzde yetki yok.</p> : (
                <form method="post" action="/api/masak-raporu/rapor" className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="code" value={code} />
                  {r.filters.includes('range') && (<>
                    <div><label className="mr-label" htmlFor={`${code}-from`}>Başlangıç</label><input className="mr-input" type="date" id={`${code}-from`} name="from" defaultValue={monthStart} /></div>
                    <div><label className="mr-label" htmlFor={`${code}-to`}>Bitiş</label><input className="mr-input" type="date" id={`${code}-to`} name="to" defaultValue={today} /></div>
                  </>)}
                  {r.filters.includes('date') && <div><label className="mr-label" htmlFor={`${code}-date`}>Gün</label><input className="mr-input" type="date" id={`${code}-date`} name="date" defaultValue={today} required /></div>}
                  {r.filters.includes('month') && <div><label className="mr-label" htmlFor={`${code}-month`}>Ay</label><input className="mr-input" type="month" id={`${code}-month`} name="month" defaultValue={today.slice(0, 7)} required /></div>}
                  {r.filters.includes('type') && <div><label className="mr-label" htmlFor={`${code}-type`}>İşlem türü</label><select className="mr-input" id={`${code}-type`} name="type"><option value="">Tümü</option>{Object.entries(TX_TYPES).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>}
                  {r.filters.includes('status') && <div><label className="mr-label" htmlFor={`${code}-status`}>Durum</label><select className="mr-input" id={`${code}-status`} name="status"><option value="">Tümü</option>{Object.entries(TX_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>}
                  {r.filters.includes('customer') && <div className="sm:col-span-2"><label className="mr-label" htmlFor={`${code}-customer`}>Müşteri (boşsa dönemdeki tüm müşteriler)</label><select className="mr-input" id={`${code}-customer`} name="customer"><option value="">Tümü</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></div>}
                  {r.filters.includes('transaction') && <div className="sm:col-span-2"><label className="mr-label" htmlFor={`${code}-tx`}>İşlem numarası</label><input className="mr-input" id={`${code}-tx`} name="transaction_number" placeholder="Örn. ISL-2026-000002" required /></div>}
                  {code === 'A' && ctx.can('sensitive.view') && <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="unmasked" className="accent-[#794c2b]" /> Kimlik numaralarını açık yaz (kayıt altına alınır)</label>}
                  <div className="sm:col-span-2"><button className="mr-btn mr-btn-primary" type="submit">PDF oluştur</button></div>
                </form>
              )}
            </Card>
          );
        })}
        <Card title="CSV / Excel dışa aktarma">
          <p className="mb-3 text-[13px] text-[#5f4d40]">UTF-8, “;” ayraçlı; Excel&apos;de doğrudan açılır. Kimlik numaraları maskelidir; gizli kayıtlar dahil edilmez.</p>
          <form method="post" action="/api/masak-raporu/csv" className="grid gap-2 sm:grid-cols-3">
            <div><label className="mr-label" htmlFor="csv-kind">Veri</label><select className="mr-input" id="csv-kind" name="kind">{Object.entries(CSV_EXPORTS).filter(([k]) => k !== 'audit' || ctx.can('audit.view')).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            <div><label className="mr-label" htmlFor="csv-from">Başlangıç</label><input className="mr-input" type="date" id="csv-from" name="from" defaultValue={monthStart} /></div>
            <div><label className="mr-label" htmlFor="csv-to">Bitiş</label><input className="mr-input" type="date" id="csv-to" name="to" defaultValue={today} /></div>
            <div className="sm:col-span-3"><button className="mr-btn mr-btn-primary" type="submit">CSV indir</button></div>
          </form>
        </Card>
      </div>
      <Card title="Son oluşturulan raporlar" className="mt-4">
        {recent.length === 0 ? <p className="mr-hint">Henüz rapor yok.</p> : (
          <div className="overflow-x-auto"><table className="mr-table"><thead><tr><th scope="col">Referans</th><th scope="col">Tür</th><th scope="col">Hazırlayan</th><th scope="col">Zaman</th><th scope="col" className="mr-num">Kayıt</th><th scope="col">SHA-256</th></tr></thead>
            <tbody>{recent.map((r) => <tr key={String(r.reference)}><td>{String(r.reference)} {Boolean(r.confidential) && <Badge tone="danger">Gizli</Badge>}</td><td>{String(r.report_type)} · {String(r.format).toUpperCase()}</td><td>{String(r.full_name)}</td><td>{formatDateTime(r.created_at as Date)}</td><td className="mr-num">{String(r.record_count)}</td><td className="font-mono text-[11px]">{String(r.sha256 || '').slice(0, 16)}…</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
