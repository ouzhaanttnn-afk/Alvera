import { REASONS, RISK_INDICATORS, GUIDE_URL } from '@/masak-raporu/server/cases';
import { requireCtx } from '@/masak-raporu/server/session';
import { transactionOptions } from '@/masak-raporu/server/transactions';
import { formatDateTime } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Card, NotOfficial, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { submitCaseAction } from '../../../actions';

export const metadata = { title: 'Şüphe bildir (iç)' };

export default async function NewCase({ searchParams }: { searchParams: Promise<{ islem?: string }> }) {
  const ctx = await requireCtx('cases.create');
  const { islem } = await searchParams;
  const txs = await transactionOptions(ctx);
  const now = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T');
  return (
    <>
      <PageHeader title="Şüphe bildir (iç değerlendirme)" description="Şüpheli bir durumu yetkili kişiye gizli olarak iletin. Tutardan bağımsızdır; işlem seçmeden de bildirim yapılabilir (Tedbirler Yön. md. 27/2)." />
      <div className="mb-4 space-y-2">
        <NotOfficial />
        <Notice tone="warn"><strong>Gizlilik:</strong> Bildirim yapıldığını veya yapılacağını müşteriye ya da işle ilgisi olmayan kişilere söylemeyin (5549 s. Kanun md. 4/2; Yön. md. 29). Müşteriyi şüphelendirecek davranışlardan kaçının (Tebliğ 13 md. 4/4).</Notice>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Bildirim">
          <ActionForm action={submitCaseAction} className="space-y-3">
            <div><label className="mr-label" htmlFor="title">Kısa başlık</label><input className="mr-input" id="title" name="title" required maxLength={200} /></div>
            <div><label className="mr-label" htmlFor="reason_category">Şüphe nedeni</label><select className="mr-input" id="reason_category" name="reason_category">{Object.entries(REASONS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            <div><label className="mr-label" htmlFor="suspicion_at">Şüphenin oluştuğu zaman</label><input className="mr-input" id="suspicion_at" name="suspicion_at" type="datetime-local" defaultValue={now} required /><p className="mr-hint mt-1">İç takip son tarihi bu zamandan itibaren 10 iş günü olarak hesaplanır (Yön. md. 28/2; gecikmesinde sakınca olan hallerde derhal).</p></div>
            <div><label className="mr-label" htmlFor="description">Ne gözlemlediniz?</label><textarea className="mr-input" id="description" name="description" required minLength={10} rows={5} /></div>
            <fieldset>
              <legend className="mr-label">İlgili işlemler (isteğe bağlı)</legend>
              <div className="max-h-[220px] space-y-1 overflow-y-auto rounded border border-[#e5dacd] p-2 text-[13px]">
                {txs.map((t) => <label key={t.id} className="flex items-start gap-2"><input type="checkbox" name="transactions[]" value={t.id} defaultChecked={t.id === islem} className="mt-1 accent-[#794c2b]" /><span>{t.number} · {t.customer_name} · {formatDateTime(t.occurred_at)} · {formatKurus(t.total)}</span></label>)}
              </div>
            </fieldset>
            <Submit>Yetkiliye gizli olarak ilet</Submit>
            {!ctx.can('cases.view') && <p className="mr-hint">Gizlilik gereği bildirdiğiniz kaydı sonradan göremezsiniz; yalnızca kayıt numarası verilir.</p>}
          </ActionForm>
        </Card>
        <Card title="Örnek risk göstergeleri (MASAK Kuyumcular ŞİB Rehberi 2.0)">
          <p className="mr-hint mb-2">Örnekler sınırlayıcı değildir; listede olmayan durumlar da değerlendirilir (Tebliğ 13 md. 8). <a className="underline" href={GUIDE_URL} target="_blank" rel="noopener noreferrer">Rehberin tamamı</a></p>
          <ul className="space-y-1 text-[13px]">{RISK_INDICATORS.map(([code, text]) => <li key={code}><span className="font-mono text-[11.5px] text-[#794c2b]">{code}</span> {text}</li>)}</ul>
        </Card>
      </div>
    </>
  );
}
