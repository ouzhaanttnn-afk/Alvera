import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bell, FileText, FolderLock, Gauge, Link2, LogOut, Package, Scale, Search, Settings, ShieldAlert, TriangleAlert, Users, Upload, ArrowLeftRight } from 'lucide-react';
import { logoutAction, switchOrgAction } from '@/app/masak-raporu/actions';
import { ROLE_LABELS, type Permission } from '../permissions';
import { notifications } from '../server/dashboard';
import type { Ctx } from '../server/session';
import { NavLink } from './nav-link';

type Item = { href: string; label: string; icon: ReactNode; perm?: Permission };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Genel', items: [{ href: '/masak-raporu', label: 'Gösterge paneli', icon: <Gauge aria-hidden /> }] },
  {
    group: 'Kayıtlar',
    items: [
      { href: '/masak-raporu/musteriler', label: 'Müşteriler (KYC)', icon: <Users aria-hidden /> },
      { href: '/masak-raporu/islemler', label: 'İşlemler', icon: <ArrowLeftRight aria-hidden /> },
      { href: '/masak-raporu/islemler/baglantilar', label: 'Bağlantılı işlemler', icon: <Link2 aria-hidden /> },
      { href: '/masak-raporu/islemler/ice-aktar', label: 'CSV içe aktarma', icon: <Upload aria-hidden />, perm: 'records.write' },
      { href: '/masak-raporu/belgeler', label: 'Belge arşivi', icon: <FolderLock aria-hidden /> },
    ],
  },
  {
    group: 'Uyum',
    items: [
      { href: '/masak-raporu/uyarilar', label: 'Kural uyarıları', icon: <TriangleAlert aria-hidden /> },
      { href: '/masak-raporu/incelemeler/yeni', label: 'Şüphe bildir (iç)', icon: <ShieldAlert aria-hidden />, perm: 'cases.create' },
      { href: '/masak-raporu/incelemeler', label: 'İç değerlendirme merkezi', icon: <ShieldAlert aria-hidden />, perm: 'cases.view' },
    ],
  },
  {
    group: 'Rapor ve denetim',
    items: [
      { href: '/masak-raporu/raporlar', label: 'Rapor merkezi', icon: <FileText aria-hidden />, perm: 'export.data' },
      { href: '/masak-raporu/denetim', label: 'Denetim hazırlık', icon: <Package aria-hidden />, perm: 'export.data' },
    ],
  },
  {
    group: 'Yönetim',
    items: [
      { href: '/masak-raporu/ayarlar/kurallar', label: 'Mevzuat ve kurallar', icon: <Scale aria-hidden /> },
      { href: '/masak-raporu/ayarlar/personel', label: 'Personel ve roller', icon: <Users aria-hidden /> },
      { href: '/masak-raporu/ayarlar', label: 'Ayarlar', icon: <Settings aria-hidden /> },
    ],
  },
];

export async function Shell({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  const n = await notifications(ctx);
  const total = n.high + n.dueCases + n.pendingLinks;
  return (
    <div className="mr-root lg:flex">
      <a href="#mr-main" className="mr-sr focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        İçeriğe geç
      </a>
      <aside className="mr-noprint bg-[#2a1f18] text-[#ecdfcf] lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:flex-none lg:overflow-y-auto">
        <details className="group lg:hidden" open={false}>
          <summary className="flex items-center justify-between px-4 py-3 text-[14px] font-bold">
            <span>ALVERA MASAK RAPORU</span>
            <span className="text-[12px] font-semibold text-[#d9b872]">Menü</span>
          </summary>
          <Nav ctx={ctx} />
        </details>
        <div className="hidden lg:block">
          <div className="px-5 pb-3 pt-5">
            <img src="/assets/alvera-wordmark-light.svg" alt="Alvera Kuyumculuk" width={150} height={53} className="h-auto w-[150px]" />
            <p className="mt-2 text-[11px] font-bold tracking-[.14em] text-[#d9b872]">MASAK RAPORU</p>
          </div>
          <Nav ctx={ctx} />
          <p className="px-5 pb-5 pt-3 text-[11px] leading-snug text-[#bba892]">İç kayıt ve denetim hazırlık aracıdır. MASAK Online&apos;ın yerine geçmez.</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="mr-noprint sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[#e5dacd] bg-white/95 px-4 py-2 backdrop-blur lg:px-6">
          <form action="/masak-raporu/ara" role="search" className="flex min-w-[200px] flex-1 items-center gap-2">
            <label htmlFor="mr-q" className="mr-sr">Hızlı arama</label>
            <Search aria-hidden className="h-4 w-4 text-[#7a6757]" />
            <input id="mr-q" name="q" type="search" placeholder="Müşteri adı, kimlik/vergi no, işlem veya fiş no" className="mr-input max-w-[440px]" autoComplete="off" />
          </form>
          <Link href="/masak-raporu/uyarilar?seviye=high" className="mr-btn" aria-label={`Bildirimler: ${total} öğe`}>
            <Bell aria-hidden className="h-4 w-4" />
            <span>{total}</span>
          </Link>
          <details className="relative">
            <summary className="mr-btn list-none">
              <span className="max-w-[160px] truncate">{ctx.user.fullName}</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-[280px] rounded-lg border border-[#e5dacd] bg-white p-3 text-[13px] shadow-lg">
              <p className="font-semibold">{ctx.user.fullName}</p>
              <p className="text-[#5f4d40]">{ctx.user.email}</p>
              <p className="mt-1 text-[12px] text-[#5f4d40]">{ROLE_LABELS[ctx.org.role]} · {ctx.org.organizationName}</p>
              {ctx.memberships.length > 1 && (
                <form action={switchOrgAction} className="mt-2 flex gap-2">
                  <label htmlFor="org-switch" className="mr-sr">İşletme</label>
                  <select id="org-switch" name="organization_id" defaultValue={ctx.org.organizationId} className="mr-input">
                    {ctx.memberships.map((m) => <option key={m.organizationId} value={m.organizationId}>{m.organizationName}</option>)}
                  </select>
                  <button className="mr-btn" type="submit">Geç</button>
                </form>
              )}
              <form action={logoutAction} className="mt-3">
                <button type="submit" className="mr-btn w-full"><LogOut aria-hidden className="h-4 w-4" /> Oturumu kapat</button>
              </form>
            </div>
          </details>
        </header>
        {(n.high > 0 || n.dueCases > 0 || n.pendingLinks > 0) && (
          <div className="mr-noprint flex flex-wrap gap-2 border-b border-[#efe6db] bg-[#fffaf2] px-4 py-2 text-[12.5px] lg:px-6" role="status">
            {n.high > 0 && <Link className="font-semibold text-[#8c1f24] underline" href="/masak-raporu/uyarilar?seviye=high">{n.high} yüksek öncelikli açık uyarı</Link>}
            {n.dueCases > 0 && <Link className="font-semibold text-[#8c1f24] underline" href="/masak-raporu/incelemeler">{n.dueCases} iç incelemenin takip süresi 3 gün içinde doluyor</Link>}
            {n.pendingLinks > 0 && <Link className="font-semibold text-[#7a4f00] underline" href="/masak-raporu/islemler/baglantilar?durum=proposed">{n.pendingLinks} bağlantı önerisi karar bekliyor</Link>}
          </div>
        )}
        {ctx.org.isDemo && (
          <div className="border-b border-[#d6ccf2] bg-[#f4f0fd] px-4 py-1.5 text-[12px] text-[#4b3696] lg:px-6">
            DEMO işletmesi: tüm kayıtlar sentetiktir; gerçek kişisel veri girmeyin.
          </div>
        )}
        <main id="mr-main" className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function Nav({ ctx }: { ctx: Ctx }) {
  return (
    <nav aria-label="MASAK Raporu menüsü" className="mr-nav px-3 pb-3">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || ctx.can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group} className="mt-3">
            <p className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-[.12em] text-[#a8957f]">{g.group}</p>
            {items.map((i) => (
              <NavLink key={i.href} href={i.href}>
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
