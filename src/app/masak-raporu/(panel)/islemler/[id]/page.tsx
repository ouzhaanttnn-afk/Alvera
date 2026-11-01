import Link from 'next/link';
import { requireCtx } from '@/masak-raporu/server/session';
import { getTransaction, PAYMENT_METHODS, TX_STATUS, TX_TYPES } from '@/masak-raporu/server/transactions';
import { customerOptions } from '@/masak-raporu/server/customers';
import { DOCUMENT_KINDS } from '@/masak-raporu/server/documents';
import { ACTION_LABELS } from '@/masak-raporu/server/audit';
import { listCases } from '@/masak-raporu/server/cases';
import { formatDate, formatDateTime } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import type { Level } from '@/masak-raporu/rules/engine';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { TransactionForm } from '@/masak-raporu/ui/transaction-form';
import { AlertReview } from '@/masak-raporu/ui/alert-review';
import { Badge, Card, Kv, LevelBadge, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { UploadDocument } from '@/masak-raporu/ui/widgets';
import { cancelTransactionAction, correctTransactionAction, linkCaseTxAction, reevaluateAction } from '../../../actions';

export const metadata = { title: 'İşlem' };

export default async function TransactionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ yeni?: string }> }) {
  const ctx = await requireCtx('records.read');
  const { id } = await params;
  const { yeni } = await searchParams;
  const d = await getTransaction(ctx, id);
  const t = d.transaction;
  const write = ctx.can('records.write');
  const open = t.status === 'completed';
  const cases = ctx.can('cases.manage') ? (await listCases(ctx)).filter((c) => c.status !== 'closed') : [];
  const customers = write && open ? await customerOptions(ctx) : [];
  const local = (v: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(v).replace(' ', 'T');
  return (
    <>
      <PageHeader title={`İşlem ${t.number}`} back={{ href: '/masak-raporu/islemler', label: 'İşlemler' }}
        description={<>{TX_TYPES[t.type as keyof typeof TX_TYPES]} · {formatDateTime(t.occurred_at as Date)} · Versiyon {String(t.version)} {t.is_demo ? <Badge tone="demo">DEMO</Badge> : null}</>}
        actions={<>
          {ctx.can('export.data') && <form method="post" action="/api/masak-raporu/rapor"><input type="hidden" name="code" value="B" /><input type="hidden" name="transaction" value={id} /><button className="mr-btn" type="submit">İşlem raporu (PDF)</button></form>}
          {write && <ActionForm action={reevaluateAction}><input type="hidden" name="id" value={id} /><Submit variant="default">Kuralları yeniden değerlendir</Submit></ActionForm>}
        </>} />
      {yeni && <div className="mb-3"><Notice>İşlem kaydedildi ve kural motorundan geçirildi. Aşağıdaki uyarıları değerlendirin.</Notice></div>}
      {t.status === 'cancelled' && <div className="mb-3"><Notice tone="warn">Bu işlem {formatDateTime(t.cancelled_at as Date)} tarihinde {String(t.cancelled_by_name)} tarafından iptal edildi. Gerekçe: {String(t.cancel_reason)}</Notice></div>}
      {t.status === 'superseded' && <div className="mb-3"><Notice tone="warn">Bu kayıt düzeltildi. Güncel kayıt: <Link className="underline" href={`/masak-raporu/islemler/${t.superseded_by}`}>{String(t.superseded_by_number)}</Link></Notice></div>}
      {Boolean(t.corrects_transaction_id) && <div className="mb-3"><Notice>Bu kayıt <Link className="underline" href={`/masak-raporu/islemler/${t.corrects_transaction_id}`}>{String(t.corrects_number)}</Link> numaralı işlemin düzeltmesidir.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="İşlem bilgileri">
          <Kv items={[
            ['Müşteri', <Link key="c" className="text-[#794c2b] underline" href={`/masak-raporu/musteriler/${t.customer_id}`}>{String(t.customer_name)} ({String(t.identity_masked || t.tax_masked || '—')})</Link>],
            ['Adına işlem yapılan', String(t.on_behalf_name || 'Kendi adına')], ['Temsilci/vekil', String(t.representative_name || '—')],
            ['Ürün', String(t.product_description)], ['Ayar / gramaj / adet', `${t.karat || '—'} / ${t.weight ? `${t.weight} g` : '—'} / ${t.quantity}`],
            ['Birim fiyat', t.unit_raw ? formatKurus(String(t.unit_raw), String(t.currency)) : '—'], ['Toplam', formatKurus(String(t.total_raw), String(t.currency))], ['TL karşılığı', formatKurus(String(t.total_try))],
            ['Kur', t.currency === 'TRY' ? '—' : `${t.fx} (${t.fx_source}, ${formatDate(String(t.fx_day))})`], ['Ödeme', `${PAYMENT_METHODS[t.payment_method as keyof typeof PAYMENT_METHODS]}${t.payment_reference ? ` · ${t.payment_reference}` : ''}`],
            ['Fatura/fiş', String(t.invoice_reference || '—')], ['Durum', TX_STATUS[t.status as keyof typeof TX_STATUS]], ['Kaydeden', String(t.created_by_name)], ['Açıklama', String(t.notes || '—')],
          ]} />
        </Card>
        <Card title="Kural uyarıları">
          {d.alerts.length === 0 ? <p className="mr-hint">Bu işlem için uyarı yok.</p> : (
            <ul className="space-y-3">
              {d.alerts.map((a) => (
                <li key={String(a.id)} className="rounded-lg border border-[#efe6db] p-3">
                  <div className="flex flex-wrap items-center gap-2"><LevelBadge level={a.level as Level} /><strong className="text-[13.5px]">{String(a.title)}</strong>{Boolean(a.confidential) && <Badge tone="danger">Gizli</Badge>}<Badge>{String(a.status) === 'open' ? 'Açık' : String(a.status) === 'resolved' ? 'Çözüldü' : String(a.status) === 'dismissed' ? 'Uygun bulunmadı' : 'Görüldü'}</Badge></div>
                  <p className="mt-1 text-[13px]">{String(a.rationale)}</p>
                  <p className="mr-hint mt-1">Kural {String(a.rule_key)} v{String(a.rule_version)} · <a className="underline" href={String(a.source_url)} target="_blank" rel="noopener noreferrer">{String(a.source_article)}</a></p>
                  {Array.isArray(a.reviews) && <ul className="mt-1 text-[12px] text-[#5f4d40]">{(a.reviews as { decision: string; note: string; at: string; by: string }[]).map((r, i) => <li key={i}>{formatDateTime(r.at)} · {r.by}: {r.note}</li>)}</ul>}
                  {ctx.can('alerts.review') && <AlertReview id={String(a.id)} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Bağlantılı işlem değerlendirmesi" actions={<Link className="mr-btn" href={`/masak-raporu/islemler/baglantilar?islem=${id}&musteri=${t.customer_id}`}>Bağlantı öner</Link>}>
          {d.groups.length === 0 ? <p className="mr-hint">Bu işlem herhangi bir bağlantı grubunda değil. Sistem işlemleri otomatik bağlamaz.</p> : (
            <ul className="space-y-2 text-[13px]">{d.groups.map((g) => (
              <li key={String(g.id)} className="rounded border border-[#efe6db] p-2">
                <Badge tone={g.status === 'confirmed' ? 'warn' : g.status === 'rejected' ? 'neutral' : 'neutral'}>{g.status === 'confirmed' ? 'Bağlantılı kabul edildi' : g.status === 'rejected' ? 'Reddedildi' : 'Karar bekliyor'}</Badge>
                <p className="mt-1">{((g.transactions as { id: string; number: string; total: string; status: string }[]) || []).map((x) => `${x.number} (${formatKurus(x.total)}${x.status !== 'completed' ? `, ${TX_STATUS[x.status as keyof typeof TX_STATUS]}` : ''})`).join(' + ')}</p>
                <p className="mr-hint">{String(g.rationale)}{g.decision_note ? ` — Karar: ${g.decision_note}` : ''}</p>
              </li>))}</ul>
          )}
        </Card>
        <Card title="Belgeler">
          {d.documents.length > 0 && <ul className="mb-3 divide-y divide-[#efe6db] text-[13px]">{d.documents.map((x) => <li key={String(x.id)} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{String(x.title)} · v{String(x.version)}</span>{ctx.can('documents.download') && <a className="mr-btn" href={`/api/masak-raporu/belge/${x.id}`}>İndir</a>}</li>)}</ul>}
          {ctx.can('documents.upload') ? <UploadDocument relation={{ transaction_id: id, customer_id: String(t.customer_id) }} kinds={DOCUMENT_KINDS} /> : d.documents.length === 0 && <p className="mr-hint">Belge yok.</p>}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Zaman çizelgesi ve denetim izi">
          <ol className="relative space-y-2 border-l border-[#e5dacd] pl-4 text-[13px]">
            {d.versions.map((v, i) => <li key={`v${i}`}><span className="font-semibold">Versiyon {String(v.version)}</span> — {v.operation === 'insert' ? 'oluşturuldu' : 'değişti'} ({TX_STATUS[v.status as keyof typeof TX_STATUS]}) <span className="mr-hint block">{formatDateTime(v.changed_at as Date)} · {String(v.full_name || 'Sistem')}</span></li>)}
            {d.timeline.map((e, i) => <li key={`e${i}`}>{ACTION_LABELS[String(e.action)] || String(e.action)} <span className="mr-hint block">{formatDateTime(e.created_at as Date)} · {String(e.full_name || 'Sistem')}</span></li>)}
            {d.versions.length + d.timeline.length === 0 && <li className="mr-hint">Ayrıntılı denetim izi rolünüz için görünür değil. Kayıt değişiklikleri veritabanında yine de saklanır.</li>}
          </ol>
          <details className="mt-3 text-[13px]"><summary className="font-semibold text-[#794c2b]">Değerlendirme geçmişi ({d.evaluations.length})</summary>
            <ul className="mt-2 space-y-1">{d.evaluations.map((e, i) => <li key={i}>{formatDateTime(e.evaluated_at as Date)} · işlem v{String(e.transaction_version)} · {(e.rule_versions as string[]).join(', ') || 'uyarı yok'} <span className="mr-hint">({String(e.full_name || 'Sistem')})</span></li>)}</ul>
          </details>
        </Card>
        {write && open && (
          <Card title="İptal veya düzeltme">
            <p className="mr-hint mb-3">Tamamlanmış işlem silinmez veya üzerine yazılmaz. İptal, gerekçesiyle kaydedilir; düzeltme yeni bir işlem kaydı açar.</p>
            <ActionForm action={cancelTransactionAction} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <label className="mr-label" htmlFor="cancel-reason">İptal gerekçesi</label>
              <textarea className="mr-input" id="cancel-reason" name="reason" required minLength={10} rows={2} />
              <Submit variant="danger">İşlemi iptal et</Submit>
            </ActionForm>
            <details className="mt-4"><summary className="text-[13px] font-semibold text-[#794c2b]">Düzeltme kaydı oluştur</summary>
              <div className="mt-2">
                <TransactionForm action={correctTransactionAction} customers={customers} correctId={id} submitLabel="Düzeltmeyi kaydet"
                  defaults={{ occurred_at: local(t.occurred_at as Date), customer_id: String(t.customer_id), type: String(t.type), product_description: String(t.product_description), karat: t.karat ? String(t.karat) : '', weight_grams: t.weight ? String(t.weight) : '', quantity: String(t.quantity), total: formatKurus(String(t.total_raw)).replace(' TL', '').replace(/ [A-Z]{3}$/, ''), currency: String(t.currency), payment_method: String(t.payment_method), invoice_reference: String(t.invoice_reference || ''), notes: String(t.notes || '') }} />
              </div>
            </details>
          </Card>
        )}
        {cases.length > 0 && (
          <Card title="İç değerlendirmeye bağla (gizli)">
            <ActionForm action={linkCaseTxAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="transaction_id" value={id} />
              <div className="min-w-[220px] flex-1"><label className="mr-label" htmlFor="case">İnceleme</label><select className="mr-input" id="case" name="id">{cases.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.number)} — {String(c.title)}</option>)}</select></div>
              <Submit variant="default">Bağla</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
