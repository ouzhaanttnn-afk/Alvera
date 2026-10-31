import { requireCtx } from '@/masak-raporu/server/session';
import { IMPORT_FIELDS } from '@/masak-raporu/csv';
import { PageHeader, Notice } from '@/masak-raporu/ui/ui';
import { ImportWizard } from '@/masak-raporu/ui/import-wizard';

export const metadata = { title: 'CSV içe aktarma' };

export default async function ImportPage() {
  await requireCtx('records.write');
  return (
    <>
      <PageHeader title="CSV içe aktarma" back={{ href: '/masak-raporu/islemler', label: 'İşlemler' }}
        description="Kasa/muhasebe programınızdan aldığınız CSV dosyasını kolon eşleme, önizleme ve doğrulamadan geçirerek içe aktarın. Excel dosyalarını “CSV UTF-8” olarak kaydedin." />
      <div className="mb-4"><Notice>Yalnızca hatasız ve mükerrer olmayan satırlar kaydedilir; her satır kural motorundan geçer. Müşteriler önce sistemde kayıtlı olmalıdır (kimlik/vergi numarasıyla eşleşir). Muhasebe programı API entegrasyonu henüz bağlı değildir.</Notice></div>
      <ImportWizard fields={Object.fromEntries(Object.entries(IMPORT_FIELDS).map(([k, v]) => [k, { label: v.label, required: v.required }]))} />
    </>
  );
}
