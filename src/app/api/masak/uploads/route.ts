import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '@/lib/config';
import { verifyToken } from '@/lib/crypto';
import { store } from '@/lib/db';
import {
  endpoint,
  HttpError,
  rateLimit,
  readBounded,
  requireOrigin,
  privateHeaders,
} from '@/lib/security';
import { deleteFile, putFile, validateFile } from '@/lib/storage';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return endpoint(async () => {
    requireOrigin(req);
    const c = config(),
      { id: intake } = verifyToken<{ id: string }>(
        req.headers.get('x-intake-token') || '',
        'intake',
      );
    await rateLimit(req, `upload:${intake}`, 8, 900);
    const kind = z
      .enum(['front', 'back', 'signature', 'residence'])
      .parse(req.headers.get('x-document-kind'));
    if (kind === 'signature' ? !c.signature : kind === 'residence' ? !c.residence : !c.documents)
      throw new HttpError(403, 'COLLECTION_DISABLED');
    if (kind === 'residence' && req.headers.get('content-type') !== 'application/pdf')
      throw new HttpError(422, 'PDF_REQUIRED');
    const db = await store();
    if (await db.byIntake(intake)) throw new HttpError(409, 'ALREADY_SUBMITTED');
    const bytes = await readBounded(req, c.maxUploadMB * 1024 * 1024);
    const file = await validateFile(
      bytes,
      req.headers.get('x-file-name') || '',
      req.headers.get('content-type') || '',
      kind === 'signature',
    );
    const path = await putFile(intake, file.bytes, file.extension, file.mime);
    const id = randomUUID();
    try {
      await db.addDocument({
        id,
        application_id: null,
        intake_id: intake,
        kind,
        path,
        mime: file.mime,
        size: file.bytes.length,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      await deleteFile(path);
      throw e;
    }
    return Response.json({ id, kind }, { headers: privateHeaders });
  });
}
