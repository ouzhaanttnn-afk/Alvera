import { expect, it, vi, afterEach } from 'vitest';
vi.mock('../src/lib/config', () => ({
  config: () => ({ local: false, url: 'https://forms.example.invalid' }),
}));
import { deliver } from '../src/lib/notifications';
import { encrypt } from '../src/lib/crypto';
import type { Application, Outbox } from '../src/lib/types';
import { synthetic } from './fixtures';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('Resend HTTP isteği doğru hedef ve sabit dedup anahtarı taşır, hassas veri içermez', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-only-not-a-real-key');
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.invalid');
  vi.stubEnv('EMAIL_FROM', 'forms@example.invalid');
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const a = {
    id: 'test',
    reference: 'NF-2026-000001',
    created_at: new Date().toISOString(),
    kind: 'individual',
    status: 'SUBMITTED',
    payload: encrypt(synthetic),
  } as Application;
  const item = { id: 'outbox-id', audience: 'admin' } as Outbox;
  await deliver(item, a);
  const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('https://api.resend.com/emails');
  expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe('nf/outbox-id');
  const body = JSON.parse(options.body as string);
  expect(body.to).toEqual(['admin@example.invalid']);
  expect(body.subject).toBe('Yeni Başvuru — NF-2026-000001');
  for (const secret of [
    synthetic.name,
    synthetic.identityNumber,
    synthetic.phone,
    synthetic.address,
  ])
    expect(options.body).not.toContain(secret);
  expect(body.attachments).toBeUndefined();
  fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(deliver(item, a)).rejects.toThrow('DELIVERY_FAILED');
});
