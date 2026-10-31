import { PAYMENT_METHODS, TX_TYPES } from '../server/transactions';
import { ActionForm, Submit, type FormAction } from './form';

type Opt = { id: string; display_name: string; identity_masked: string | null; tax_masked: string | null };
type D = Record<string, string | undefined>;

export function TransactionForm({ action, customers, defaults = {}, correctId, submitLabel = 'İşlemi kaydet' }: { action: FormAction; customers: Opt[]; defaults?: D; correctId?: string; submitLabel?: string }) {
  const custOptions = customers.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({c.identity_masked || c.tax_masked || 'kimlik yok'})</option>);
  const f = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}) => {
    const { hint, ...rest } = props;
    return (
      <div>
        <label className="mr-label" htmlFor={name}>{label}{rest.required && <span aria-hidden className="text-[#a3262b]"> *</span>}</label>
        <input className="mr-input" id={name} name={name} defaultValue={defaults[name]} autoComplete="off" {...rest} />
        {hint && <p className="mr-hint mt-1">{hint}</p>}
      </div>
    );
  };
  return (
    <ActionForm action={action} className="space-y-4">
      {correctId && <input type="hidden" name="id" value={correctId} />}
      <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 text-[13px] font-bold">İşlem</legend>
        {f('occurred_at', 'Tarih ve saat', { type: 'datetime-local', required: true, hint: 'Türkiye saati. Kural motoru bu tarihte yürürlükte olan eşiği uygular.' })}
        <div>
          <label className="mr-label" htmlFor="type">İşlem türü<span aria-hidden className="text-[#a3262b]"> *</span></label>
          <select className="mr-input" id="type" name="type" defaultValue={defaults.type || 'gold_sale'}>{Object.entries(TX_TYPES).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        </div>
        <div>
          <label className="mr-label" htmlFor="status">Kayıt durumu</label>
          <select className="mr-input" id="status" name="status" defaultValue="completed"><option value="completed">Tamamlandı</option><option value="draft">Taslak</option></select>
        </div>
        <div className="sm:col-span-2">
          <label className="mr-label" htmlFor="customer_id">İşlemi yapan müşteri<span aria-hidden className="text-[#a3262b]"> *</span></label>
          <select className="mr-input" id="customer_id" name="customer_id" defaultValue={defaults.customer_id || ''} required><option value="">Seçin</option>{custOptions}</select>
        </div>
        <div>
          <label className="mr-label" htmlFor="on_behalf_of_customer_id">Adına işlem yapılan (varsa)</label>
          <select className="mr-input" id="on_behalf_of_customer_id" name="on_behalf_of_customer_id" defaultValue={defaults.on_behalf_of_customer_id || ''}><option value="">Kendi adına</option>{custOptions}</select>
        </div>
      </fieldset>
      <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-[13px] font-bold">Ürün</legend>
        <div className="sm:col-span-2 lg:col-span-4">{f('product_description', 'Ürün açıklaması', { required: true, maxLength: 500 })}</div>
        <div>
          <label className="mr-label" htmlFor="karat">Ayar</label>
          <select className="mr-input" id="karat" name="karat" defaultValue={defaults.karat || ''}><option value="">—</option>{[8, 9, 10, 14, 18, 21, 22, 24].map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </div>
        {f('weight_grams', 'Gramaj (g)', { inputMode: 'decimal', hint: 'Örn. 20,500' })}
        {f('quantity', 'Adet', { type: 'number', min: 1, defaultValue: defaults.quantity || '1' })}
        {f('unit_price', 'Birim fiyat', { inputMode: 'decimal', hint: 'Girilirse adet × birim fiyat = toplam olmalı.' })}
      </fieldset>
      <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-[13px] font-bold">Tutar ve ödeme</legend>
        {f('total', 'Toplam tutar', { required: true, inputMode: 'decimal', hint: 'Örn. 228.000,00' })}
        {f('currency', 'Para birimi', { defaultValue: defaults.currency || 'TRY', maxLength: 3, hint: 'TRY dışındaysa kur bilgileri zorunlu.' })}
        {f('fx_rate', 'Kur (1 birim = ? TL)', { inputMode: 'decimal' })}
        {f('fx_date', 'Kur tarihi', { type: 'date' })}
        <div className="sm:col-span-2">{f('fx_source', 'Kur kaynağı', { hint: 'Örn. TCMB döviz satış kuru' })}</div>
        <div>
          <label className="mr-label" htmlFor="payment_method">Ödeme yöntemi<span aria-hidden className="text-[#a3262b]"> *</span></label>
          <select className="mr-input" id="payment_method" name="payment_method" defaultValue={defaults.payment_method || 'nakit'}>{Object.entries(PAYMENT_METHODS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        </div>
        {f('payment_reference', 'Ödeme referansı', { hint: 'Dekont/POS no' })}
        {f('invoice_reference', 'Fatura / fiş no')}
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mr-label" htmlFor="notes">Açıklama</label>
          <textarea className="mr-input" id="notes" name="notes" rows={2} defaultValue={defaults.notes} maxLength={2000} />
        </div>
      </fieldset>
      {correctId && (
        <div className="mr-card p-4">
          <label className="mr-label" htmlFor="reason">Düzeltme gerekçesi<span aria-hidden className="text-[#a3262b]"> *</span></label>
          <textarea className="mr-input" id="reason" name="reason" required minLength={10} rows={2} />
          <p className="mr-hint mt-1">Eski kayıt silinmez; &quot;Düzeltildi&quot; durumuna geçer ve bu yeni kayda bağlanır.</p>
        </div>
      )}
      <Submit>{submitLabel}</Submit>
    </ActionForm>
  );
}
