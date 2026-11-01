import { reviewAlertAction } from '@/app/masak-raporu/actions';
import { ActionForm, Submit } from './form';

export function AlertReview({ id }: { id: string }) {
  return (
    <details className="mt-2">
      <summary className="text-[12.5px] font-semibold text-[#794c2b]">Değerlendir</summary>
      <ActionForm action={reviewAlertAction} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={id} />
        <label className="mr-label" htmlFor={`note-${id}`}>Değerlendirme notu</label>
        <textarea className="mr-input" id={`note-${id}`} name="note" required minLength={5} rows={2} />
        <div className="flex flex-wrap gap-2">
          <Submit variant="default" name="decision" value="resolved">Çözüldü</Submit>
          <Submit variant="default" name="decision" value="acknowledged">Görüldü</Submit>
          <Submit variant="default" name="decision" value="dismissed">Uygun bulunmadı</Submit>
          <Submit variant="default" name="decision" value="note">Yalnızca not ekle</Submit>
        </div>
      </ActionForm>
    </details>
  );
}
