import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { signToken } from '@/lib/crypto';
import {
  endpoint,
  jsonBody,
  rateLimit,
  requireOrigin,
  verifyTurnstile,
  privateHeaders,
} from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return endpoint(async () => {
    requireOrigin(req);
    await rateLimit(req, 'intake', 30);
    const body = z.object({ captcha: z.string().max(4096) }).parse(await jsonBody(req));
    await verifyTurnstile(body.captcha);
    const id = randomUUID();
    return Response.json(
      { token: signToken({ purpose: 'intake', id }), expiresIn: 900 },
      { headers: privateHeaders },
    );
  });
}
