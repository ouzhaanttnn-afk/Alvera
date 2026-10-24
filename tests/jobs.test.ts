import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { POST } from '../src/app/api/masak/jobs/route';
import { store } from '../src/lib/db';
import { LocalStore } from '../src/lib/local-store';
import { getFile, putFile } from '../src/lib/storage';
import { submit } from '../src/lib/service';
import { synthetic } from './fixtures';
it('Yetkili worker terk edilmiş belgeyi siler, retention talebi açar, e-posta hatası kaydı korur', async () => {
  process.env.CRON_SECRET = 'synthetic-job-only-secret';
  const denied = await POST(new Request('http://localhost/api/masak/jobs', { method: 'POST' }));
  expect(denied.status).toBe(401);
  const db = await store(),
    intake = randomUUID();
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#fff' } })
    .png()
    .toBuffer();
  const path = await putFile(intake, bytes, 'png', 'image/png');
  const doc = randomUUID();
  await db.addDocument({
    id: doc,
    application_id: null,
    intake_id: intake,
    kind: 'front',
    path,
    mime: 'image/png',
    size: bytes.length,
    created_at: '2000-01-01T00:00:00.000Z',
  });
  const appIntake = randomUUID();
  await submit(appIntake, synthetic, []);
  const app = (await db.byIntake(appIntake))!;
  (db as LocalStore).db
    .prepare('update applications set created_at=? where id=?')
    .run('2000-01-01T00:00:00.000Z', app.id);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = await POST(
    new Request('http://localhost/api/masak/jobs', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-job-only-secret' },
    }),
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ cleaned: 1, flagged: 1, failed: 1, sent: 0 });
  expect(await db.document(doc)).toBeNull();
  await expect(getFile(path)).rejects.toThrow();
  expect((await db.get(app.id))!.deletion_requested_at).toBeTruthy();
  expect((await db.outbox(app.id))[0].state).toBe('failed');
  log.mockRestore();
});
