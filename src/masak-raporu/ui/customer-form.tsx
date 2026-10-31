'use client';
import { useState } from 'react';
import { ActionForm, Submit, type FormAction } from './form';

const IDENTITY_TYPES: [string, string][] = [
  ['tc_kimlik_karti', 'T.C. Kimlik Kartı'], ['nufus_cuzdani', 'T.C. Nüfus Cüzdanı'], ['pasaport', 'Pasaport'],
  ['yabanci_kimlik', 'Yabancılara mahsus kimlik / ikamet izni'], ['mavi_kart', 'Mavi Kart'], ['diger', 'Diğer resmi belge'],
];

type D = Record<string, unknown>;
const v = (d: D, k: string) => (d[k] == null ? '' : String(d[k]));

export function CustomerForm({ action, defaults = {}, id, prefill }: { action: FormAction; defaults?: D; id?: string; prefill?: D }) {
  const [kind, setKind] = useState<string>(v(defaults, 'kind') || 'natural');
  const d = { ...defaults, ...(prefill || {}) };
  const input = (name: string, label: string, opts: { type?: string; required?: boolean; hint?: string; auto?: string } = {}) => (
    <div>
      <label className="mr-label" htmlFor={name}>{label}{opts.required && <span aria-hidden className="text-[#a3262b]"> *</span>}</label>
      <input className="mr-input" id={name} name={name} type={opts.type || 'text'} defaultValue={v(d, name)} required={opts.required} autoComplete={opts.auto || 'off'} aria-describedby={opts.hint ? `${name}-h` : undefined} />
      {opts.hint && <p id={`${name}-h`} className="mr-hint mt-1">{opts.hint}</p>}
    </div>
  );
  return (
    <ActionForm action={action} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <fieldset className="mr-card p-4">
        <legend className="px-1 text-[13px] font-bold">Müşteri tipi</legend>
        <div className="flex flex-wrap gap-4">
          {[['natural', 'Gerçek kişi'], ['legal', 'Tüzel kişi']].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[#794c2b]" disabled={Boolean(id)} />
              {l}
            </label>
          ))}
          {id && <input type="hidden" name="kind" value={kind} />}
        </div>
      </fieldset>
      {kind === 'natural' ? (
        <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2">
          <legend className="px-1 text-[13px] font-bold">Kimlik bilgileri (Tedbirler Yön. md. 6)</legend>
          {input('first_name', 'Ad', { required: true })}
          {input('last_name', 'Soyad', { required: true })}
          <div>
            <label className="mr-label" htmlFor="identity_type">Kimlik belgesi türü</label>
            <select className="mr-input" id="identity_type" name="identity_type" defaultValue={v(d, 'identity_type') || 'tc_kimlik_karti'}>
              {IDENTITY_TYPES.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </div>
          {input('identity_number', id ? 'T.C. kimlik / yabancı kimlik no (değiştirmek için girin)' : 'T.C. kimlik / yabancı kimlik no', { hint: 'Şifreli saklanır; ekranlarda maskeli gösterilir. TCKN sağlama kontrolü resmi doğrulama değildir.' })}
          {input('identity_document_number', 'Belge seri/numarası')}
          {input('nationality', 'Uyruk', { hint: 'Örn. Türkiye' })}
          {input('birth_date', 'Doğum tarihi', { type: 'date' })}
          {input('birth_place', 'Doğum yeri')}
          {input('mother_name', 'Anne adı', { hint: 'Yalnızca gerekli ise doldurun.' })}
          {input('father_name', 'Baba adı', { hint: 'Yalnızca gerekli ise doldurun.' })}
          {input('occupation', 'İş / meslek')}
        </fieldset>
      ) : (
        <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2">
          <legend className="px-1 text-[13px] font-bold">Tüzel kişi bilgileri (Tedbirler Yön. md. 7)</legend>
          {input('legal_name', 'Unvan', { required: true })}
          {input('trade_registry_number', 'Ticaret sicil no')}
          {input('tax_office', 'Vergi dairesi')}
          {input('tax_number', id ? 'Vergi kimlik no (değiştirmek için girin)' : 'Vergi kimlik no', { hint: 'Şifreli saklanır; ekranlarda maskeli gösterilir.' })}
          <div className="sm:col-span-2">{input('activity', 'Faaliyet konusu')}</div>
          <p className="mr-hint sm:col-span-2">Temsile yetkili kişi ve %25 üzeri pay sahibi gerçek faydalanıcılar müşteri kaydedildikten sonra ayrıntı sayfasından eklenir (md. 7, md. 17/A).</p>
        </fieldset>
      )}
      <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2">
        <legend className="px-1 text-[13px] font-bold">İletişim</legend>
        <div className="sm:col-span-2">
          <label className="mr-label" htmlFor="address">Açık adres</label>
          <textarea className="mr-input" id="address" name="address" defaultValue={v(d, 'address')} rows={2} />
        </div>
        {input('phone', 'Telefon', { type: 'tel' })}
        {input('email', 'E-posta', { type: 'email' })}
      </fieldset>
      <fieldset className="mr-card grid gap-3 p-4 sm:grid-cols-2">
        <legend className="px-1 text-[13px] font-bold">Risk ve ilişki</legend>
        <div>
          <label className="mr-label" htmlFor="risk_level">Risk seviyesi</label>
          <select className="mr-input" id="risk_level" name="risk_level" defaultValue={v(d, 'risk_level') || 'standard'}>
            <option value="low">Düşük</option><option value="standard">Standart</option><option value="high">Yüksek</option>
          </select>
        </div>
        <div className="space-y-2 pt-5 text-[13px]">
          <label className="flex items-start gap-2"><input type="checkbox" name="continuous_relationship" defaultChecked={Boolean(d.continuous_relationship)} className="mt-1 accent-[#794c2b]" /><span>Sürekli iş ilişkisi var <span className="mr-hint block">Kimlik tespiti tutara bakılmaksızın gerekir (md. 5/1-a).</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="identity_doubt" defaultChecked={Boolean(d.identity_doubt)} className="mt-1 accent-[#794c2b]" /><span>Önceki kimlik bilgisinin doğruluğundan şüphe var <span className="mr-hint block">Kimlik tespiti yenilenmelidir (md. 5/1-e).</span></span></label>
        </div>
        <div className="sm:col-span-2">
          <label className="mr-label" htmlFor="risk_notes">Risk değerlendirmesi / açıklama</label>
          <textarea className="mr-input" id="risk_notes" name="risk_notes" defaultValue={v(d, 'risk_notes')} rows={2} />
        </div>
        {!id && (
          <label className="flex items-start gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" name="kvkk_notice_given" className="mt-1 accent-[#794c2b]" />
            <span>KVKK aydınlatma metni müşteriye sunuldu <span className="mr-hint block">Metin taslak şablondur; hukuk onayı tamamlanmadan canlı kullanıma geçmeyin.</span></span>
          </label>
        )}
        {!id && (
          <label className="flex items-start gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" name="allow_duplicate" className="mt-1 accent-[#794c2b]" />
            <span>Benzer kayıt uyarısına rağmen yine de kaydet <span className="mr-hint block">Aynı kimlik numarasıyla ikinci kayıt hiçbir durumda açılmaz.</span></span>
          </label>
        )}
      </fieldset>
      <Submit>{id ? 'Değişiklikleri kaydet' : 'Müşteriyi kaydet'}</Submit>
    </ActionForm>
  );
}
