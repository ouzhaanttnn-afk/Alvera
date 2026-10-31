import Link from 'next/link';
import { requireCtx } from '@/masak-raporu/server/session';
import { LINK_BASIS, listLinkGroups, transactionOptions, TX_STATUS } from '@/masak-raporu/server/transactions';
import { formatDateTime } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Card, Empty, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { decideLinkAction, proposeLinkAction } from '../../../actions';

export const metadata = { title: 'Bağlantılı işlemler' };

export default async function Links({ searchParams }: { searchParams: Promise<{ durum?: string; islem?: string; musteri?: string }> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const groups = await listLinkGroups(ctx, ['proposed', 'confirmed', 'rejected'].includes(sp.durum || '') ? sp.durum : '');
  const options = ctx.can('records.write') ? await transactionOptions(ctx, sp.musteri && /^[0-9a-f-]{36}$/.test(sp.musteri) ? sp.musteri : undefined) : [];
  return (
    <>
      <PageHeader title="Bağlantılı işlem değerlendirmesi" description="Bağlantılı işlemler toplamı, Tedbirler Yön. md. 5/1-b kapsamında kimlik tespiti eşiği için önemlidir. Mevzuatta resmi bir tanım bulunmadığından sistem işlemleri otomatik bağlamaz; yetkili kişi müşteri, temsil, zaman, belge ve ödeme bağlamını değerlendirip karar verir." />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {[['', 'Tümü'], ['proposed', 'Karar bekleyen'], ['confirmed', 'Bağlantılı kabul'], ['rejected', 'Reddedilen']].map(([v, l]) => (
          <Link key={v} className={`mr-btn ${sp.durum === v || (!sp.durum && !v) ? 'mr-btn-primary' : ''}`} href={`/masak-raporu/islemler/baglantilar${v ? `?durum=${v}` : ''}`}>{l}</Link>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {groups.length === 0 ? <Empty title="Bağlantı kaydı yok" /> : groups.map((g) => {
            const txs = g.transactions as { id: string; number: string; total: string; status: string; occurred_at: string }[];
            return (
              <Card key={String(g.id)} title={<span className="flex flex-wrap items-center gap-2">{g.status === 'confirmed' ? <Badge tone="warn">Bağlantılı kabul edildi</Badge> : g.status === 'rejected' ? <Badge>Reddedildi</Badge> : <Badge tone="neutral">Karar bekliyor</Badge>} Geçerli toplam: {formatKurus(String(g.total))}</span>}>
                <ul className="text-[13px]">{txs.map((t) => <li key={t.id}><Link className="text-[#794c2b] underline" href={`/masak-raporu/islemler/${t.id}`}>{t.number}</Link> · {formatDateTime(t.occurred_at)} · {formatKurus(t.total)} {t.status !== 'completed' && <Badge>{TX_STATUS[t.status as keyof typeof TX_STATUS]}</Badge>}</li>)}</ul>
                <p className="mt-2 text-[13px]"><strong>Dayanak:</strong> {(g.basis as string[]).map((b) => LINK_BASIS[b as keyof typeof LINK_BASIS]).join(', ')}</p>
                <p className="text-[13px]"><strong>Gerekçe:</strong> {String(g.rationale)} <span className="mr-hint">— {String(g.proposed_by_name)}, {formatDateTime(g.created_at as Date)}</span></p>
                {g.decision_note ? <p className="text-[13px]"><strong>Karar:</strong> {String(g.decision_note)} <span className="mr-hint">— {String(g.decided_by_name)}, {formatDateTime(g.decided_at as Date)}</span></p> : null}
                {g.status === 'proposed' && ctx.can('links.decide') && (
                  <ActionForm action={decideLinkAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={String(g.id)} />
                    <label className="mr-label" htmlFor={`n-${g.id}`}>Karar gerekçesi</label>
                    <textarea className="mr-input" id={`n-${g.id}`} name="note" required minLength={10} rows={2} />
                    <div className="flex gap-2"><Submit name="decision" value="confirmed">Bağlantılı kabul et</Submit><Submit variant="default" name="decision" value="rejected">Bağlantılı değil</Submit></div>
                  </ActionForm>
                )}
              </Card>
            );
          })}
        </div>
        {ctx.can('records.write') && (
          <Card title="Yeni bağlantı önerisi">
            <Notice>Öneri, karar verilene kadar toplama katılmaz. Aynı gün veya aynı kişiden yapılmış olması tek başına bağlantı sayılmaz; somut dayanak ve gerekçe yazın.</Notice>
            <form className="mt-3 flex items-end gap-2" aria-label="Müşteriye göre işlem süz">
              <div className="flex-1"><label className="mr-label" htmlFor="musteri-f">Müşteri kimliği ile süz</label><input className="mr-input" id="musteri-f" name="musteri" defaultValue={sp.musteri} placeholder="İşlem sayfasından gelindiğinde dolu" /></div>
              <button className="mr-btn" type="submit">Süz</button>
            </form>
            <ActionForm action={proposeLinkAction} className="mt-3 space-y-3">
              <fieldset>
                <legend className="mr-label">İşlemler (en az iki)</legend>
                <div className="max-h-[260px] space-y-1 overflow-y-auto rounded border border-[#e5dacd] p-2 text-[13px]">
                  {options.map((o) => (
                    <label key={o.id} className="flex items-start gap-2"><input type="checkbox" name="transactions[]" value={o.id} defaultChecked={o.id === sp.islem} className="mt-1 accent-[#794c2b]" /><span>{o.number} · {o.customer_name} · {formatDateTime(o.occurred_at)} · {formatKurus(o.total)}</span></label>
                  ))}
                  {options.length === 0 && <p className="mr-hint">İşlem yok.</p>}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mr-label">Dayanak</legend>
                <div className="grid grid-cols-2 gap-1 text-[13px]">{Object.entries(LINK_BASIS).map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="basis[]" value={k} className="accent-[#794c2b]" />{l}</label>)}</div>
              </fieldset>
              <div><label className="mr-label" htmlFor="rationale">Gerekçe</label><textarea className="mr-input" id="rationale" name="rationale" required minLength={10} rows={3} /></div>
              <Submit>Öneriyi kaydet</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
