import Link from 'next/link';
import { CASE_STATUS, getCase, REASONS } from '@/masak-raporu/server/cases';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Card, Kv, NotOfficial, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { UploadDocument } from '@/masak-raporu/ui/widgets';
import { updateCaseAction } from '../../../actions';

export const metadata = { title: 'İç değerlendirme' };

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('cases.view');
  const { id } = await params;
  const d = await getCase(ctx, id);
  const c = d.case;
  const overdue = !['closed', 'reported_externally'].includes(String(c.status)) && new Date(c.due_at as string).getTime() < Date.now();
  return (
    <>
      <PageHeader title={`${c.number} — ${c.title}`} back={{ href: '/masak-raporu/incelemeler', label: 'İç değerlendirmeler' }} description={<><Badge tone="danger">Gizli</Badge> <Badge>{CASE_STATUS[c.status as keyof typeof CASE_STATUS]}</Badge></>} />
      <div className="mb-4 space-y-2">
        <NotOfficial />
        {overdue && <Notice tone="danger">İç takip süresi ({formatDateTime(c.due_at as Date)}) geçti. Yönetmelik md. 28/2 uyarınca bildirim şüphenin oluştuğu tarihten itibaren en geç on iş günü içinde yapılır; gecikmesinde sakınca bulunan hallerde derhal.</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Kayıt">
          <Kv items={[
            ['Neden', REASONS[c.reason_category as keyof typeof REASONS]], ['Bildiren', String(c.created_by_name)], ['Şüphenin oluştuğu zaman', formatDateTime(c.suspicion_at as Date)],
            ['İç takip son tarihi', formatDateTime(c.due_at as Date)], ['Sorumlu', String(c.assigned_name || '—')], ['Açıklama', String(c.description)],
            ['Karar gerekçesi', String(c.decision_reason || '—')], ['Resmi kanal kaydı', c.official_report_reference ? `${c.report_day} · ${c.official_report_reference} (yetkili beyanı)` : '—'],
          ]} />
          <h3 className="mt-4 text-[13px] font-bold">İlgili işlemler</h3>
          {d.transactions.length === 0 ? <p className="mr-hint">Tutardan bağımsız kayıt; işlem bağlanmadı. İşlem sayfasından bağlayabilirsiniz.</p> : (
            <ul className="text-[13px]">{d.transactions.map((t) => <li key={String(t.id)}><Link className="text-[#794c2b] underline" href={`/masak-raporu/islemler/${t.id}`}>{String(t.number)}</Link> · {String(t.customer_name)} · {formatDateTime(t.occurred_at as Date)} · {formatKurus(String(t.total))}</li>)}</ul>
          )}
          <h3 className="mt-4 text-[13px] font-bold">Belgeler</h3>
          {d.documents.length > 0 && <ul className="mb-2 text-[13px]">{d.documents.map((x) => <li key={String(x.id)} className="flex items-center justify-between gap-2 py-1"><span>{String(x.title)}</span>{ctx.can('documents.download') && <a className="mr-btn" href={`/api/masak-raporu/belge/${x.id}`}>İndir</a>}</li>)}</ul>}
          {ctx.can('cases.manage') && <UploadDocument relation={{ case_id: id }} kinds={{ ic_inceleme: 'İç inceleme belgesi' }} allowConfidential />}
        </Card>
        <div className="space-y-4">
          {ctx.can('cases.manage') && (
            <Card title="Değerlendirme ve karar">
              <ActionForm action={updateCaseAction} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <div><label className="mr-label" htmlFor="status">Durum</label><select className="mr-input" id="status" name="status" defaultValue={String(c.status)}>{Object.entries(CASE_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
                <div><label className="mr-label" htmlFor="assigned_to">Sorumlu</label><select className="mr-input" id="assigned_to" name="assigned_to" defaultValue={String(c.assigned_to || '')}><option value="">Değiştirme</option>{d.assignees.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}</select></div>
                <div><label className="mr-label" htmlFor="note">Değerlendirme notu</label><textarea className="mr-input" id="note" name="note" required rows={3} /></div>
                <div><label className="mr-label" htmlFor="decision_reason">Karar gerekçesi (kapatma ve bildirmeme kararında zorunlu)</label><textarea className="mr-input" id="decision_reason" name="decision_reason" rows={2} /><p className="mr-hint mt-1">&quot;Bildirimde bulunmama&quot; kararının yazılı gerekçesi saklanır (Yön. md. 46/2).</p></div>
                <fieldset className="rounded border border-[#e5dacd] p-2">
                  <legend className="mr-label px-1">Yetkili tarafından resmi kanaldan yapılmış bildirim (yalnızca kayıt)</legend>
                  <p className="mr-hint mb-2">Bu sistem MASAK&apos;a gönderim yapmaz. Bildirimi MASAK Online&apos;da yaptıysanız tarih ve referansı buraya not edin.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><label className="mr-label" htmlFor="official_report_date">Tarih</label><input className="mr-input" id="official_report_date" name="official_report_date" type="date" /></div>
                    <div><label className="mr-label" htmlFor="official_report_reference">Referans</label><input className="mr-input" id="official_report_reference" name="official_report_reference" maxLength={120} /></div>
                  </div>
                </fieldset>
                <Submit>Kaydet</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="Zaman damgalı geçmiş">
            <ol className="space-y-2 border-l border-[#e5dacd] pl-4 text-[13px]">
              {d.events.map((e) => (
                <li key={String(e.id)}>
                  <span className="font-semibold">{e.to_status ? (e.from_status && e.from_status !== e.to_status ? `${CASE_STATUS[e.from_status as keyof typeof CASE_STATUS]} → ${CASE_STATUS[e.to_status as keyof typeof CASE_STATUS]}` : CASE_STATUS[e.to_status as keyof typeof CASE_STATUS]) : String(e.kind)}</span>
                  {e.note ? <p>{String(e.note)}</p> : null}
                  <span className="mr-hint">{formatDateTime(e.created_at as Date)} · {String(e.full_name)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
