import Link from 'next/link';
import { getCustomer, IDENTITY_TYPES } from '@/masak-raporu/server/customers';
import { DOCUMENT_KINDS } from '@/masak-raporu/server/documents';
import { requireCtx } from '@/masak-raporu/server/session';
import { TX_STATUS, TX_TYPES } from '@/masak-raporu/server/transactions';
import { formatDate, formatDateTime } from '@/masak-raporu/dates';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { OcrPanel } from '@/masak-raporu/ui/ocr-panel';
import { Badge, Card, Kv, Money, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { Reveal, UploadDocument } from '@/masak-raporu/ui/widgets';
import { addPersonAction, confirmCheckAction, identityCheckAction, revealCustomerAction } from '../../../actions';

export const metadata = { title: 'Müşteri' };

const METHODS: Record<string, string> = { belge_inceleme: 'Belge aslı incelendi', ocr_destekli: 'OCR destekli (manuel onaylı)', resmi_sorgu: 'Resmi sorgu', diger: 'Diğer' };
const RELATIONS: Record<string, string> = { yetkili_temsilci: 'Yetkili temsilci', vekil: 'Vekil', kanuni_temsilci: 'Kanuni temsilci', diger: 'Diğer' };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('records.read');
  const { id } = await params;
  const d = await getCustomer(ctx, id);
  const c = d.customer;
  const legal = c.kind === 'legal';
  const write = ctx.can('records.write');
  return (
    <>
      <PageHeader
        title={String(c.display_name)}
        back={{ href: '/masak-raporu/musteriler', label: 'Müşteriler' }}
        description={<>{legal ? 'Tüzel kişi' : 'Gerçek kişi'} · Kayıt versiyonu {String(c.version)} {c.is_demo ? <Badge tone="demo">DEMO</Badge> : null}</>}
        actions={<>
          {write && <Link className="mr-btn" href={`/masak-raporu/musteriler/${id}/duzenle`}>Düzenle</Link>}
          {write && <Link className="mr-btn mr-btn-primary" href={`/masak-raporu/islemler/yeni?musteri=${id}`}>Yeni işlem</Link>}
        </>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {d.verified ? <Badge tone="ok">✓ Onaylı kimlik teyit kaydı var</Badge> : <Badge tone="warn">! Onaylı kimlik teyit kaydı yok</Badge>}
        {Boolean(c.continuous_relationship) && <Badge>Sürekli iş ilişkisi</Badge>}
        {Boolean(c.identity_doubt) && <Badge tone="danger">Kimlik bilgisinden şüphe</Badge>}
        {c.risk_level === 'high' && <Badge tone="danger">Yüksek risk</Badge>}
      </div>
      {d.missing.length > 0 && <div className="mb-4"><Notice tone="warn">Kimlik tespiti gerektiğinde eksik kalacak alanlar: <strong>{d.missing.join(', ')}</strong>. (Tedbirler Yön. md. 6/7 — hukuki doğrulama gerekir)</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Kayıt bilgileri">
          <Kv items={legal ? [
            ['Unvan', String(c.legal_name)], ['Vergi kimlik no', String(c.tax_masked || '—')], ['Vergi dairesi', String(c.tax_office || '—')],
            ['Ticaret sicil no', String(c.trade_registry_number || '—')], ['Faaliyet konusu', String(c.activity || '—')], ['Adres', String(c.address || '—')],
            ['Telefon', String(c.phone || '—')], ['E-posta', String(c.email || '—')], ['Risk notu', String(c.risk_notes || '—')],
          ] : [
            ['Ad soyad', `${c.first_name} ${c.last_name}`], ['Kimlik belgesi', IDENTITY_TYPES[c.identity_type as keyof typeof IDENTITY_TYPES] || '—'], ['Kimlik no', String(c.identity_masked || '—')],
            ['Uyruk', String(c.nationality || '—')], ['Doğum tarihi / yeri', `${formatDate(c.birth_date as string)} / ${c.birth_place || '—'}`], ['Anne / baba adı', `${c.mother_name || '—'} / ${c.father_name || '—'}`],
            ['İş / meslek', String(c.occupation || '—')], ['Adres', String(c.address || '—')], ['Telefon', String(c.phone || '—')], ['E-posta', String(c.email || '—')],
            ['Risk notu', String(c.risk_notes || '—')], ['KVKK aydınlatması', c.kvkk_notice_given_at ? formatDateTime(c.kvkk_notice_given_at as Date) : 'Kayıt yok'],
          ]} />
          {ctx.can('sensitive.view') ? <div className="mt-3"><Reveal action={revealCustomerAction} id={id} /></div> : <p className="mr-hint mt-3">Hassas bilgiler rolünüz gereği maskeli gösterilir.</p>}
        </Card>
        <Card title="Kimlik tespit ve teyidi">
          {d.checks.length === 0 ? <p className="mr-hint mb-3">Teyit kaydı yok.</p> : (
            <ul className="mb-3 divide-y divide-[#efe6db] text-[13px]">
              {d.checks.map((k) => (
                <li key={String(k.id)} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {k.status === 'verified' ? <Badge tone="ok">✓ Doğrulandı</Badge> : k.status === 'pending' ? <Badge tone="warn">Onay bekliyor</Badge> : <Badge tone="danger">Reddedildi</Badge>}
                    <span>{METHODS[String(k.method)]}</span>{Boolean(k.ocr_used) && <Badge>{k.ocr_confirmed ? 'OCR + manuel onay' : 'OCR (onaysız)'}</Badge>}
                  </div>
                  <p className="mr-hint">{formatDateTime(k.checked_at as Date)} · {String(k.document_type)} {k.confirmed_by_name ? `· Onaylayan: ${k.confirmed_by_name}` : ''}</p>
                  {k.notes ? <p className="text-[12.5px]">{String(k.notes)}</p> : null}
                  {k.status === 'pending' && write && (
                    <ActionForm action={confirmCheckAction} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={String(k.id)} /><input type="hidden" name="customer_id" value={id} />
                      {Boolean(k.ocr_used) && <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" name="ocr_confirmed" className="mt-1 accent-[#794c2b]" /> OCR ile okunan bilgileri belge aslıyla tek tek karşılaştırdım; kayıttaki bilgiler doğrudur.</label>}
                      <Submit variant="default">Teyidi onayla</Submit>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {write && (
            <details>
              <summary className="text-[13px] font-semibold text-[#794c2b]">Yeni teyit kaydı ekle</summary>
              <div className="mt-2 space-y-3">
                <OcrPanel />
                <ActionForm action={identityCheckAction} className="space-y-2">
                  <input type="hidden" name="customer_id" value={id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><label className="mr-label" htmlFor="method">Yöntem</label><select className="mr-input" id="method" name="method">{Object.entries(METHODS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
                    <div><label className="mr-label" htmlFor="document_type">Belge</label><select className="mr-input" id="document_type" name="document_type">{Object.entries(legal ? { ticaret_sicil: 'Ticaret sicil belgesi', vergi_levhasi: 'Vergi levhası', 'imza_sirküleri': 'İmza sirküleri' } : IDENTITY_TYPES).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
                  </div>
                  <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" name="ocr_used" className="mt-1 accent-[#794c2b]" /> Bilgiler OCR yardımıyla dolduruldu</label>
                  <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" name="confirm" className="mt-1 accent-[#794c2b]" /> Belge aslını gördüm, bilgileri karşılaştırdım ve teyidi onaylıyorum <span className="mr-hint block">İşaretlemezseniz kayıt &quot;onay bekliyor&quot; olarak kalır.</span></label>
                  <div><label className="mr-label" htmlFor="notes">Not</label><input className="mr-input" id="notes" name="notes" maxLength={1000} /></div>
                  <Submit>Teyit kaydını kaydet</Submit>
                </ActionForm>
              </div>
            </details>
          )}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title={legal ? 'Temsile yetkili kişiler' : 'Temsilci / vekil kayıtları'}>
          {d.representatives.length === 0 ? <p className="mr-hint">Kayıt yok.</p> : (
            <ul className="divide-y divide-[#efe6db] text-[13px]">{d.representatives.map((r) => <li key={String(r.id)} className="py-1.5"><strong>{String(r.full_name)}</strong> · {RELATIONS[String(r.relation)]} · {String(r.identity_masked || '—')} {r.authority_document ? `· ${r.authority_document}` : ''} {r.valid_until ? `· ${formatDate(String(r.valid_until))} tarihine kadar` : ''}</li>)}</ul>
          )}
          {write && <PersonForm customerId={id} kind="representative" />}
        </Card>
        <Card title="Gerçek faydalanıcılar">
          <p className="mr-hint mb-2">Tüzel kişilerde %25&apos;ten fazla paya sahip gerçek kişiler; yoksa nihai kontrol eden kişi (Tedbirler Yön. md. 17/A).</p>
          {d.owners.length === 0 ? <p className="mr-hint">Kayıt yok.</p> : (
            <ul className="divide-y divide-[#efe6db] text-[13px]">{d.owners.map((r) => <li key={String(r.id)} className="py-1.5"><strong>{String(r.full_name)}</strong> · {String(r.identity_masked || '—')} {r.ownership_percent ? `· %${r.ownership_percent}` : ''} {r.control_description ? `· ${r.control_description}` : ''}</li>)}</ul>
          )}
          {write && <PersonForm customerId={id} kind="owner" />}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="İşlem geçmişi">
          {d.transactions.length === 0 ? <p className="mr-hint">İşlem yok.</p> : (
            <table className="mr-table"><thead><tr><th scope="col">No</th><th scope="col">Tarih</th><th scope="col">Tür</th><th scope="col" className="mr-num">Tutar</th><th scope="col">Durum</th></tr></thead>
              <tbody>{d.transactions.map((t) => <tr key={String(t.id)}><td><Link className="text-[#794c2b] hover:underline" href={`/masak-raporu/islemler/${t.id}`}>{String(t.number)}</Link></td><td>{formatDateTime(t.occurred_at as Date)}</td><td>{TX_TYPES[t.type as keyof typeof TX_TYPES]}</td><td className="mr-num"><Money kurus={t.total_try_kurus} /></td><td>{TX_STATUS[t.status as keyof typeof TX_STATUS]}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="Belgeler">
          <p className="mr-hint mb-2">Kimlik belgesi kopyası zorunlu değildir; bilgilerin kaydedilmesi de mevzuatça kabul edilir (Yön. md. 6/2). Yalnızca gerekliyse yükleyin.</p>
          {d.documents.length > 0 && (
            <ul className="mb-3 divide-y divide-[#efe6db] text-[13px]">{d.documents.map((x) => <li key={String(x.id)} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{String(x.title)} · v{String(x.version)} {x.superseded ? <Badge>Eski versiyon</Badge> : null}</span>{ctx.can('documents.download') && <a className="mr-btn" href={`/api/masak-raporu/belge/${x.id}`}>İndir</a>}</li>)}</ul>
          )}
          {ctx.can('documents.upload') && <UploadDocument relation={{ customer_id: id }} kinds={DOCUMENT_KINDS} />}
        </Card>
      </div>
    </>
  );
}

function PersonForm({ customerId, kind }: { customerId: string; kind: 'representative' | 'owner' }) {
  return (
    <details className="mt-3">
      <summary className="text-[13px] font-semibold text-[#794c2b]">{kind === 'owner' ? 'Gerçek faydalanıcı ekle' : 'Temsilci ekle'}</summary>
      <ActionForm action={addPersonAction} className="mt-2 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="customer_id" value={customerId} /><input type="hidden" name="person_kind" value={kind} />
        <div><label className="mr-label" htmlFor={`${kind}-name`}>Ad soyad</label><input className="mr-input" id={`${kind}-name`} name="full_name" required /></div>
        <div><label className="mr-label" htmlFor={`${kind}-id`}>Kimlik no</label><input className="mr-input" id={`${kind}-id`} name="identity_number" /></div>
        <div><label className="mr-label" htmlFor={`${kind}-nat`}>Uyruk</label><input className="mr-input" id={`${kind}-nat`} name="nationality" /></div>
        {kind === 'representative' ? (<>
          <div><label className="mr-label" htmlFor="relation">İlişki</label><select className="mr-input" id="relation" name="relation">{Object.entries(RELATIONS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
          <div><label className="mr-label" htmlFor="authority_document">Yetki belgesi</label><input className="mr-input" id="authority_document" name="authority_document" placeholder="Örn. noter onaylı vekâletname" /></div>
          <div><label className="mr-label" htmlFor="valid_until">Geçerlilik sonu</label><input className="mr-input" id="valid_until" name="valid_until" type="date" /></div>
        </>) : (<>
          <div><label className="mr-label" htmlFor="ownership_percent">Pay oranı (%)</label><input className="mr-input" id="ownership_percent" name="ownership_percent" inputMode="decimal" /></div>
          <div className="sm:col-span-2"><label className="mr-label" htmlFor="control_description">Kontrol açıklaması</label><input className="mr-input" id="control_description" name="control_description" /></div>
        </>)}
        <div className="sm:col-span-2"><Submit variant="default">Ekle</Submit></div>
      </ActionForm>
    </details>
  );
}
