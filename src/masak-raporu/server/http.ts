import 'server-only';
import { ZodError } from 'zod';
import { AppError, safeMessage } from './errors';
import { getCtx, type Ctx } from './session';

export const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };

/** CSRF: durum değiştiren isteklerde Origin, istek yapılan host ile aynı olmalı. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!origin || !host) throw new AppError('ORIGIN', 'Geçersiz istek kaynağı.', 403);
  try {
    if (new URL(origin).host !== host) throw 0;
  } catch {
    throw new AppError('ORIGIN', 'Geçersiz istek kaynağı.', 403);
  }
}

export async function handle(req: Request, fn: (ctx: Ctx) => Promise<Response>, opts: { mutating?: boolean; json?: boolean } = {}): Promise<Response> {
  try {
    if (opts.mutating) sameOrigin(req);
    const ctx = await getCtx();
    if (!ctx) throw new AppError('LOGIN_REQUIRED', 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.', 401);
    const res = await fn(ctx);
    for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const status = e instanceof AppError ? e.status : e instanceof ZodError ? 422 : 400;
    const message = e instanceof ZodError ? 'Girilen bilgiler geçersiz.' : safeMessage(e);
    if (opts.json) return Response.json({ error: message }, { status, headers: NO_STORE });
    return new Response(
      `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>İşlem tamamlanamadı</title>
<body style="font-family:system-ui,sans-serif;background:#f7f3ee;color:#2f241d;padding:40px"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5dacd;border-radius:12px;padding:24px">
<h1 style="font-size:20px">İşlem tamamlanamadı</h1><p>${escapeHtml(message)}</p><p><a href="javascript:history.back()" style="color:#794c2b">Geri dön</a> · <a href="/masak-raporu" style="color:#794c2b">Panel</a></p></main></body></html>`,
      { status, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function attachment(data: Uint8Array | string, filename: string, type: string) {
  const ascii = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return new Response(typeof data === 'string' ? data : Buffer.from(data), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

export function formParams(fd: FormData) {
  const v = (k: string) => {
    const x = fd.get(k);
    return typeof x === 'string' && x.trim() ? x.trim() : undefined;
  };
  return { v, bool: (k: string) => fd.get(k) === 'on' || fd.get(k) === 'true' };
}
