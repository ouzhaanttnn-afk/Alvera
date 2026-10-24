import { expect, it, vi, afterEach } from 'vitest';
import sharp from 'sharp';
vi.mock('../src/lib/config', () => ({ config: () => ({ local: false, maxUploadMB: 5 }) }));
import { validateFile } from '../src/lib/storage';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('Tarama gateway yalnız açık clean=true sonucunu kabul eder; hata/timeout kapalıdır', async () => {
  vi.stubEnv('FILE_SCAN_URL', 'https://scanner.example.invalid');
  vi.stubEnv('FILE_SCAN_TOKEN', 'test-only-token');
  const file = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#fff' } })
    .png()
    .toBuffer();
  const fetcher = vi.fn().mockResolvedValue(new Response('{"clean":false}', { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(validateFile(file, 'test.png', 'image/png')).rejects.toMatchObject({ status: 422 });
  fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(validateFile(file, 'test.png', 'image/png')).rejects.toThrow();
  fetcher.mockRejectedValue(new Error('timeout'));
  await expect(validateFile(file, 'test.png', 'image/png')).rejects.toThrow();
  fetcher.mockResolvedValue(new Response('{"clean":true}', { status: 200 }));
  expect((await validateFile(file, 'test.png', 'image/png')).mime).toBe('image/png');
});
