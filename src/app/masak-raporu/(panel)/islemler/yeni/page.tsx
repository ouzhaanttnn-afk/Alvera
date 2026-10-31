import Link from 'next/link';
import { customerOptions } from '@/masak-raporu/server/customers';
import { requireCtx } from '@/masak-raporu/server/session';
import { TransactionForm } from '@/masak-raporu/ui/transaction-form';
import { Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { createTransactionAction } from '../../../actions';

export const metadata = { title: 'Yeni işlem' };

export default async function NewTransaction({ searchParams }: { searchParams: Promise<{ musteri?: string }> }) {
  const ctx = await requireCtx('records.write');
  const { musteri } = await searchParams;
  const customers = await customerOptions(ctx);
  const now = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T');
  return (
    <>
      <PageHeader title="Yeni işlem" back={{ href: '/masak-raporu/islemler', label: 'İşlemler' }} />
      {customers.length === 0 ? (
        <Notice tone="warn">Önce müşteri kaydı oluşturun. <Link className="underline" href="/masak-raporu/musteriler/yeni">Yeni müşteri</Link></Notice>
      ) : (
        <>
          <div className="mb-4"><Notice>Kayıt sonrası işlem, işlem tarihinde yürürlükte olan kural versiyonlarıyla otomatik değerlendirilir. Uyarılar açıklayıcıdır; hukuki karar yetkili kişiye aittir.</Notice></div>
          <TransactionForm action={createTransactionAction} customers={customers} defaults={{ customer_id: musteri, occurred_at: now }} />
        </>
      )}
    </>
  );
}
