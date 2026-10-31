import Link from 'next/link';
import { quickSearch } from '@/masak-raporu/server/dashboard';
import { identifierHash } from '@/masak-raporu/server/keys';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDateTime } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { Card, Empty, PageHeader } from '@/masak-raporu/ui/ui';

export const metadata = { title: 'Arama' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx('records.read');
  const q = ((await searchParams).q || '').slice(0, 100);
  const digits = q.replace(/\s/g, '');
  const r = await quickSearch(ctx, q, /^[A-Z0-9]{6,20}$/i.test(digits) ? identifierHash(ctx.org.organizationId, digits) : null);
  return (
    <>
      <PageHeader title="Arama" description={q ? `“${q}” için sonuçlar` : 'Üst çubuktan arama yapın.'} />
      {q.length >= 2 && r.customers.length + r.transactions.length === 0 && <Empty title="Sonuç yok" />}
      <div className="grid gap-4 md:grid-cols-2">
        {r.customers.length > 0 && <Card title="Müşteriler"><ul className="text-[13px]">{r.customers.map((c) => <li key={c.id} className="py-1"><Link className="text-[#794c2b] underline" href={`/masak-raporu/musteriler/${c.id}`}>{c.display_name}</Link> <span className="mr-hint">{c.identity_masked}</span></li>)}</ul></Card>}
        {r.transactions.length > 0 && <Card title="İşlemler"><ul className="text-[13px]">{r.transactions.map((t) => <li key={t.id} className="py-1"><Link className="text-[#794c2b] underline" href={`/masak-raporu/islemler/${t.id}`}>{t.number}</Link> <span className="mr-hint">{formatDateTime(t.occurred_at)} · {formatKurus(t.total)}</span></li>)}</ul></Card>}
      </div>
    </>
  );
}
