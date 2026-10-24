import { z } from 'zod';
import { verifyToken } from '@/lib/crypto';
import { submit } from '@/lib/service';
import { endpoint, jsonBody, requireOrigin, rateLimit, privateHeaders } from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return endpoint(async () => {
    requireOrigin(req);
    const { id } = verifyToken<{ id: string }>(req.headers.get('x-intake-token') || '', 'intake');
    await rateLimit(req, `submit:${id}`, 10, 900);
    const body = z
      .object({ data: z.unknown(), documents: z.array(z.uuid()).max(4) })
      .parse(await jsonBody(req));
    return Response.json(await submit(id, body.data, body.documents), {
      status: 201,
      headers: privateHeaders,
    });
  });
}
