import { AppError } from '@/masak-raporu/server/errors';
import { attachment, formParams, handle } from '@/masak-raporu/server/http';
import { generateReport, REPORTS, type ReportCode } from '@/masak-raporu/server/reports';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(req, async (ctx) => {
    const fd = await req.formData();
    const { v, bool } = formParams(fd);
    const code = v('code') as ReportCode;
    if (!code || !(code in REPORTS)) throw new AppError('UNKNOWN_REPORT', 'Rapor türü bulunamadı.', 404);
    let transaction = v('transaction');
    const number = v('transaction_number');
    if (!transaction && number) {
      const r = await ctx.db((sql) => sql.query<{ id: string }>('select id from masak.transactions where organization_id = $1 and number = $2', [ctx.org.organizationId, number.toUpperCase()]));
      if (!r[0]) throw new AppError('NOT_FOUND', 'Bu numarayla işlem bulunamadı.', 404);
      transaction = r[0].id;
    }
    const out = await generateReport(ctx, code, {
      from: v('from'), to: v('to'), date: v('date'), month: v('month'), customer: v('customer'), transaction, type: v('type'), status: v('status'), unmasked: bool('unmasked') || undefined,
    });
    return attachment(out.bytes, out.filename, 'application/pdf');
  }, { mutating: true });
}
