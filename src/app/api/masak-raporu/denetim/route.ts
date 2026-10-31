import { auditPackage } from '@/masak-raporu/server/audit-package';
import { attachment, formParams, handle } from '@/masak-raporu/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, async (ctx) => {
    const { v, bool } = formParams(await req.formData());
    const out = await auditPackage(ctx, { from: v('from'), to: v('to'), include_documents: bool('include_documents'), include_confidential: bool('include_confidential') });
    const res = attachment(out.zip, out.filename, 'application/zip');
    res.headers.set('X-Manifest-SHA256', out.manifestHash);
    return res;
  }, { mutating: true });
}
