import { cookies } from 'next/headers';
import { z } from 'zod';
import { authClient, allowedUser, localMfa, localPassword } from '@/lib/auth';
import { config } from '@/lib/config';
import {
  endpoint,
  HttpError,
  jsonBody,
  privateHeaders,
  rateLimit,
  requireOrigin,
} from '@/lib/security';
type Context = { params: Promise<{ path: string[] }> };
export async function POST(req: Request, ctx: Context) {
  return endpoint(async () => {
    requireOrigin(req);
    await rateLimit(req, 'admin-auth', 15, 900);
    const { path } = await ctx.params;
    const action = path[0],
      c = config('admin');
    if (action === 'logout') {
      if (c.local) (await cookies()).set('nf_admin', '', { maxAge: 0, path: '/' });
      else await (await authClient()).auth.signOut();
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (action === 'password') {
      const body = z
        .object({ email: z.string().max(254), password: z.string().max(300) })
        .parse(await jsonBody(req));
      if (c.local) {
        await localPassword(body.password);
        return Response.json({ mfa: true, local: true }, { headers: privateHeaders });
      }
      const client = await authClient();
      const { data, error } = await client.auth.signInWithPassword(body);
      if (error || !data.user) throw new HttpError(401, 'LOGIN_FAILED');
      try {
        await allowedUser(data.user.id);
      } catch (e) {
        await client.auth.signOut();
        throw e;
      }
      const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
      if (factorError) throw new HttpError(503, 'MFA_UNAVAILABLE');
      const verified = factors.totp.find((f) => f.status === 'verified');
      if (verified)
        return Response.json({ mfa: true, factorId: verified.id }, { headers: privateHeaders });
      for (const f of factors.all.filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified',
      ))
        await client.auth.mfa.unenroll({ factorId: f.id });
      const { data: factor, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Alvera Form',
      });
      if (enrollError || !factor) throw new HttpError(503, 'MFA_UNAVAILABLE');
      return Response.json(
        { mfa: true, factorId: factor.id, qr: factor.totp.qr_code, secret: factor.totp.secret },
        { headers: privateHeaders },
      );
    }
    if (action === 'mfa') {
      const body = z
        .object({ code: z.string().regex(/^\d{6}$/), factorId: z.string().max(100).optional() })
        .parse(await jsonBody(req));
      if (c.local) await localMfa(body.code);
      else {
        const client = await authClient();
        const { data: user, error } = await client.auth.getUser();
        if (error || !user.user) throw new HttpError(401, 'LOGIN_REQUIRED');
        await allowedUser(user.user.id);
        if (!body.factorId) throw new HttpError(400, 'MFA_FAILED');
        const { error: mfaError } = await client.auth.mfa.challengeAndVerify({
          factorId: body.factorId,
          code: body.code,
        });
        if (mfaError) throw new HttpError(401, 'MFA_FAILED');
      }
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    throw new HttpError(404, 'NOT_FOUND');
  }, 'admin');
}
