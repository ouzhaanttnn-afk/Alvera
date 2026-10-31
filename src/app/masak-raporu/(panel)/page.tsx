import Link from 'next/link';
import { dashboard } from '@/masak-raporu/server/dashboard';
import { requireCtx } from '@/masak-raporu/server/session';
import { ACTION_LABELS } from '@/masak-raporu/server/audit';
import { formatDate, formatDateTime, istanbulDate } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { Card, NotOfficial, PageHeader } from '@/masak-raporu/ui/ui';
import { DailyChart } from '@/masak-raporu/ui/chart';

export const metadata = { title: 'Gösterge paneli' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string }> }) {
  const ctx = await requireCtx('records.read');
  const sp = await searchParams;
  const today = istanbulDate(new Date());
  const d14 = istanbulDate(new Date(Date.now() - 29 * 86_400_000));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.bas || '') ? sp.bas! : d14;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.bit || '') ? sp.bit! : today;
  const valid = from <= to && new Date(to).getTime() - new Date(from).getTime() <= 366 * 86_400_000;
  const d = await dashboard(ctx, valid ? from : d14, valid ? to : today);
  const range = `bas=${from}&bit=${to}`;
  const tile = (label: string, value: string | number, href: string, note?: string, tone?: 'danger' | 'warn') => (
    <Link href={href} className="mr-card block p-4 no-underline transition hover:border-[#b8924a]">
      <p className="text-[12px] font-semibold text-[#5f4d40]">{label}</p>
      <p className={`mt-1 text-[24px] font-bold tabular-nums ${tone === 'danger' ? 'text-[#8c1f24]' : tone === 'warn' ? 'text-[#7a4f00]' : 'text-[#2f241d]'}`}>{value}</p>
      {note && <p className="mr-hint mt-0.5">{note}</p>}
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Gösterge paneli"
        description={`${ctx.org.organizationName} · ${formatDate(from)} – ${formatDate(to)}`}
        actions={
          <form className="flex flex-wrap items-end gap-2" aria-label="Dönem seçimi">
            <div><label className="mr-label" htmlFor="bas">Başlangıç</label><input className="mr-input" type="date" id="bas" name="bas" defaultValue={from} /></div>
            <div><label className="mr-label" htmlFor="bit">Bitiş</label><input className="mr-input" type="date" id="bit" name="bit" defaultValue={to} /></div>
            <button className="mr-btn" type="submit">Uygula</button>
          </form>
        }
      />
      {!valid && <p role="alert" className="mb-3 text-[13px] text-[#8c1f24]">Tarih aralığı geçersiz (en fazla 1 yıl). Son 30 gün gösteriliyor.</p>}
      {d.demoCount > 0 && <p className="mb-3 rounded-lg border border-[#d6ccf2] bg-[#f4f0fd] px-3 py-1.5 text-[12.5px] text-[#4b3696]">Bu işletmede {d.demoCount} DEMO (sentetik) işlem var — grafikler bunları içerir.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tile('Bugünkü işlem', d.today, `/masak-raporu/islemler?bas=${today}&bit=${today}`)}
        {tile('Dönem işlem sayısı', d.summary.count, `/masak-raporu/islemler?${range}&durum=completed`)}
        {tile('Dönem toplamı', formatKurus(d.summary.total), `/masak-raporu/islemler?${range}&durum=completed`, `Satış ${formatKurus(d.summary.sales)} · Alış ${formatKurus(d.summary.purchases)}`)}
        {tile('Kimlik tespiti gereken işlem', d.identity.required, `/masak-raporu/uyarilar?durum=`, `${d.identity.unverified} işlemde onaylı teyit kaydı yok`, d.identity.unverified ? 'danger' : undefined)}
        {tile('Eksik doğrulama / bilgi', d.missing, '/masak-raporu/uyarilar?kural=VERI-EKSIK', 'Açık "eksik veri" uyarısı', d.missing ? 'warn' : undefined)}
        {tile('İnceleme bekleyen uyarı', d.alerts.high + d.alerts.review, '/masak-raporu/uyarilar', `${d.alerts.high} yüksek öncelik · ${d.alerts.review} inceleme`, d.alerts.high ? 'danger' : undefined)}
        {tile('Karar bekleyen bağlantı önerisi', d.pendingLinks, '/masak-raporu/islemler/baglantilar?durum=proposed')}
        {ctx.can('cases.view')
          ? tile('Açık iç değerlendirme', d.cases.open, '/masak-raporu/incelemeler', `${d.cases.due_soon} tanesinin takip süresi 3 gün içinde`, d.cases.due_soon ? 'danger' : undefined)
          : tile('Tamamlanan kontrol', d.alerts.info, '/masak-raporu/uyarilar?seviye=info', 'Bilgi seviyesindeki açık kayıtlar')}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Günlük tamamlanan işlem tutarı (TL)">
          <DailyChart days={d.days} />
        </Card>
        <Card title="Son aktiviteler">
          {d.activity.length === 0 ? (
            <p className="mr-hint">Henüz kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-[#efe6db]">
              {d.activity.map((a, i) => (
                <li key={i} className="py-2 text-[13px]">
                  <span className="font-semibold">{ACTION_LABELS[String(a.action)] || String(a.action)}</span>
                  <span className="block text-[12px] text-[#5f4d40]">{String(a.full_name || 'Sistem')} · {formatDateTime(a.created_at as Date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Yaklaşan iç kontrol görevleri">
          <ul className="list-disc space-y-1 pl-5 text-[13px]">
            {d.identity.unverified > 0 && <li><Link className="underline" href="/masak-raporu/uyarilar?seviye=high">{d.identity.unverified} işlemin kimlik teyit kaydını tamamlayın</Link> (Tedbirler Yön. md. 5/2: tespit işlemden önce yapılır).</li>}
            {d.pendingLinks > 0 && <li><Link className="underline" href="/masak-raporu/islemler/baglantilar?durum=proposed">{d.pendingLinks} bağlantı önerisi</Link> için yetkili kararı verin.</li>}
            <li>Kural kaynaklarının güncelliğini <Link className="underline" href="/masak-raporu/ayarlar/kurallar">Mevzuat ve kurallar</Link> sayfasından kontrol edin (Resmî Gazete değişiklikleri).</li>
            <li>Saklama politikalarının hukuk onayını <Link className="underline" href="/masak-raporu/ayarlar">Ayarlar</Link> bölümünde tamamlayın.</li>
          </ul>
        </Card>
        <Card title="Hatırlatma"><NotOfficial /></Card>
      </div>
    </>
  );
}
