import { afterEach, expect, it, vi } from 'vitest';
import { config, pageConfiguration } from '../src/lib/config';
afterEach(() => vi.unstubAllEnvs());
it('Remote intake is explicitly closed by default', () => {
  vi.stubEnv('APP_MODE', 'supabase');
  vi.stubEnv('MASAK_INTAKE_ENABLED', 'false');
  expect(() => config()).toThrow('INTAKE_CLOSED');
  vi.stubEnv('VERCEL_ENV', 'preview');
  expect(pageConfiguration().policy.previewOnly).toBe(true);
});
