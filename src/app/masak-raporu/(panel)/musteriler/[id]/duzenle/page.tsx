import { getCustomer } from '@/masak-raporu/server/customers';
import { requireCtx } from '@/masak-raporu/server/session';
import { CustomerForm } from '@/masak-raporu/ui/customer-form';
import { PageHeader } from '@/masak-raporu/ui/ui';
import { updateCustomerAction } from '../../../../actions';

export const metadata = { title: 'Müşteri düzenle' };

export default async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('records.write');
  const { id } = await params;
  const d = await getCustomer(ctx, id);
  const c = d.customer;
  const defaults = { ...c, birth_date: c.birth_date ? new Date(c.birth_date as string).toISOString().slice(0, 10) : '' };
  if (!ctx.can('sensitive.view')) for (const k of ['address', 'phone', 'email', 'mother_name', 'father_name']) delete (defaults as Record<string, unknown>)[k];
  return (
    <>
      <PageHeader title={`Düzenle: ${c.display_name}`} back={{ href: `/masak-raporu/musteriler/${id}`, label: 'Müşteri' }}
        description={ctx.can('sensitive.view') ? 'Her değişiklik yeni bir kayıt versiyonu olarak saklanır.' : 'Maskeli alanlar boş gösterilir; boş bırakırsanız mevcut değer korunur, yalnızca girdiğiniz yeni değer yazılır. Her değişiklik yeni bir kayıt versiyonu olarak saklanır.'} />
      <CustomerForm action={updateCustomerAction} defaults={defaults} id={id} />
    </>
  );
}
