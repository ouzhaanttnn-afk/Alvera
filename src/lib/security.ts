import { config } from './config';
import { privateHash } from './crypto';
import { store } from './db';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function requireOrigin(req: Request) {
  if (req.headers.get('origin') !== new URL(config('admin').url).origin)
    throw new HttpError(403, 'ORIGIN_DENIED');
}
export async function rateLimit(req: Request, scope: string, limit = 20, seconds = 600) {
  const header = process.env.TRUSTED_IP_HEADER;
  const ip = header ? req.headers.get(header) || 'unknown' : 'global';
  if (!(await (await store()).rate(privateHash(`${scope}:${ip}`), limit, seconds)))
    throw new HttpError(429, 'RATE_LIMITED');
}
export async function jsonBody(req: Request, max = 20000): Promise<unknown> {
  return JSON.parse((await readBounded(req, max)).toString('utf8'));
}
export async function readBounded(req: Request, max: number) {
  if (Number(req.headers.get('content-length') || 0) > max) throw new HttpError(413, 'TOO_LARGE');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'EMPTY_BODY');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new HttpError(413, 'TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function verifyTurnstile(token: string) {
  const c = config();
  if (c.local) return;
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await result.json();
  if (
    !result.ok ||
    !data.success ||
    data.hostname !== new URL(c.url).hostname ||
    data.action !== 'application'
  )
    throw new HttpError(400, 'CAPTCHA_FAILED');
}
export function safeLog(event: 'REQUEST_FAILED' | 'NOTIFICATION_FAILED' | 'CLEANUP_FAILED') {
  console.error(JSON.stringify({ event }));
}
export async function endpoint(
  fn: () => Promise<Response>,
  scope: 'intake' | 'admin' = 'intake',
): Promise<Response> {
  let response: Response;
  try {
    config(scope);
    response = await fn();
  } catch (e) {
    if (e instanceof HttpError) response = Response.json({ error: e.code }, { status: e.status });
    else if (e instanceof ZodError)
      response = Response.json({ error: 'INVALID_FIELDS' }, { status: 422 });
    else if (e instanceof SyntaxError)
      response = Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    else if (e instanceof Error && e.message === 'INVALID_TOKEN')
      response = Response.json({ error: 'INVALID_TOKEN' }, { status: 401 });
    else {
      safeLog('REQUEST_FAILED');
      response = Response.json({ error: 'OPERATION_FAILED' }, { status: 503 });
    }
  }
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}
export const privateHeaders = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
