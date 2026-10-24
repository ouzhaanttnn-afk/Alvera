import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: { id: 'allowed-admin' } as { id: string } | null,
  allowed: true,
  aal: 'aal2',
  cookie: undefined as string | undefined,
}));
vi.mock('../src/lib/config', () => ({ config: () => ({ local: false }) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: () => {},
  }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: state.aal },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock('../src/lib/db', () => ({
  supabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.allowed ? { id: 'allowed-admin' } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
import { requireAdmin } from '../src/lib/auth';
beforeEach(() => {
  state.user = { id: 'allowed-admin' };
  state.allowed = true;
  state.aal = 'aal2';
});
it('Sunucu gerçek kullanıcı + izin listesi + AAL2 ister', async () => {
  expect(await requireAdmin()).toEqual({ id: 'allowed-admin' });
  state.aal = 'aal1';
  await expect(requireAdmin()).rejects.toMatchObject({ status: 403, code: 'MFA_REQUIRED' });
});
it('Kimliği doğrulanmış ama izin verilmeyen kullanıcı reddedilir', async () => {
  state.allowed = false;
  await expect(requireAdmin()).rejects.toMatchObject({ status: 403, code: 'ADMIN_REQUIRED' });
});
it('Oturumsuz kullanıcı reddedilir', async () => {
  state.user = null;
  await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
});
