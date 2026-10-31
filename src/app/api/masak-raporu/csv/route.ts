import { AppError } from '@/masak-raporu/server/errors';
import { attachment, formParams, handle } from '@/masak-raporu/server/http';
import { CSV_EXPORTS, exportCsv } from '@/masak-raporu/server/reports';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(req, async (ctx) => {
    const { v } = formParams(await req.formData());
    const kind = v('kind') as keyof typeof CSV_EXPORTS;
    if (!kind || !(kind in CSV_EXPORTS)) throw new AppError('UNKNOWN_EXPORT', 'Dışa aktarma türü bulunamadı.', 404);
    const out = await exportCsv(ctx, kind, { from: v('from'), to: v('to') });
    return attachment(out.csv, out.filename, 'text/csv; charset=utf-8');
  }, { mutating: true });
}
