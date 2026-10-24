import { config } from '@/lib/config';
import { equalSecret } from '@/lib/crypto';
import { store } from '@/lib/db';
import { processOutbox } from '@/lib/notifications';
import { deleteFile } from '@/lib/storage';
import { endpoint, HttpError, privateHeaders } from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return endpoint(async () => {
    const c = config();
    if (
      !process.env.CRON_SECRET ||
      !equalSecret(req.headers.get('authorization') || '', `Bearer ${process.env.CRON_SECRET}`)
    )
      throw new HttpError(401, 'JOB_DENIED');
    const db = await store();
    if (!(await db.rate('jobs', 1, 60))) throw new HttpError(429, 'JOB_BUSY');
    const result = await processOutbox();
    let cleaned = 0,
      flagged = 0;
    for (const doc of await db.orphaned(new Date(Date.now() - 24 * 3600000).toISOString())) {
      await deleteFile(doc.path);
      await db.deleteDocument(doc.id);
      cleaned++;
    }
    for (const app of await db.expired(
      new Date(Date.now() - c.retentionDays * 86400000).toISOString(),
    )) {
      await db.deletion(app.id, 'retention-worker', false);
      flagged++;
    }
    return Response.json({ ...result, cleaned, flagged }, { headers: privateHeaders });
  });
}
