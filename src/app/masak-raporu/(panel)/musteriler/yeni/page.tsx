import { requireCtx } from '@/masak-raporu/server/session';
import { CustomerForm } from '@/masak-raporu/ui/customer-form';
import { Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { createCustomerAction } from '../../../actions';

export const metadata = { title: 'Yeni müşteri' };

export default async function NewCustomer() {
  await requireCtx('records.write');
  return (
    <>
      <PageHeader title="Yeni müşteri" back={{ href: '/masak-raporu/musteriler', label: 'Müşteriler' }}
        description="Yalnızca mevzuatın gerektirdiği ve işlem için gerekli bilgileri girin. Kimlik belgesi görüntüsü zorunlu değildir; Yönetmelik md. 6/2 belge kopyası yerine bilgilerin kaydedilmesine de izin verir." />
      <div className="mb-4"><Notice>Kimlik belgesini OCR ile okumak için müşteriyi kaydettikten sonra ayrıntı sayfasındaki <strong>Kimlik teyidi</strong> bölümünü kullanın. OCR tarayıcınızda çalışır; görüntü sunucuya gönderilmez.</Notice></div>
      <CustomerForm action={createCustomerAction} />
    </>
  );
}
