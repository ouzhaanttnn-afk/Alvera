import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { store } from '@/lib/db';
import { detail } from '@/lib/service';
import { deleteFile, getFile } from '@/lib/storage';
import { createApplicationPdf } from '@/lib/pdf';
import { statuses } from '@/lib/types';
import { endpoint, HttpError, jsonBody, privateHeaders, requireOrigin } from '@/lib/security';
type Context = { params: Promise<{ path: string[] }> };
export const runtime = 'nodejs';
export async function GET(req: Request, ctx: Context) {
  return endpoint(async () => {
    const actor = await requireAdmin(),
      db = await store(),
      { path } = await ctx.params;
    if (path[0] === 'session') return Response.json({ id: actor.id }, { headers: privateHeaders });
    if (path[0] === 'applications' && path.length === 1) {
      const p = new URL(req.url).searchParams;
      const filters = z
        .object({
          reference: z
            .string()
            .regex(/^[A-Za-z0-9-]*$/)
            .max(30),
          status: z.union([z.enum(statuses), z.literal('')]),
          from: z.union([z.iso.date(), z.literal('')]),
          to: z.union([z.iso.date(), z.literal('')]),
          page: z.coerce.number().int().min(1).max(10000),
        })
        .parse({
          reference: p.get('reference') || '',
          status: p.get('status') || '',
          from: p.get('from') || '',
          to: p.get('to') || '',
          page: p.get('page') || 1,
        });
      const rows = await db.list(filters);
      await db.audit('', actor.id, 'LIST_VIEWED');
      return Response.json(
        rows.map(({ payload, intake_id, ...a }) => a),
        { headers: privateHeaders },
      );
    }
    if (path[0] === 'applications' && path[1]) {
      const id = z.uuid().parse(path[1]);
      const d = await detail(id);
      if (path[2] === 'pdf') {
        await db.audit(id, actor.id, 'PDF_DOWNLOADED');
        return new Response(new Uint8Array(await createApplicationPdf(d)), {
          headers: {
            ...privateHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${d.application.reference}.pdf"`,
          },
        });
      }
      if (path.length !== 2) throw new HttpError(404, 'NOT_FOUND');
      await db.audit(id, actor.id, 'DETAIL_VIEWED');
      return Response.json(
        {
          ...d,
          application: { ...d.application, payload: undefined, intake_id: undefined },
          data: { ...d.data, identityNumber: d.application.masked_identity },
          history: d.history.map((h) => ({ ...h, note: h.note ? undefined : null })),
          documents: d.documents.map(({ path, intake_id, ...doc }) => doc),
        },
        { headers: privateHeaders },
      );
    }
    if (path[0] === 'documents' && path[1]) {
      const d = await db.document(z.uuid().parse(path[1]));
      if (!d?.application_id) throw new HttpError(404, 'NOT_FOUND');
      await db.audit(d.application_id, actor.id, 'DOCUMENT_VIEWED');
      return new Response(new Uint8Array(await getFile(d.path)), {
        headers: {
          ...privateHeaders,
          'Content-Type': d.mime,
          'Content-Disposition': `attachment; filename="${d.kind}.${d.mime === 'application/pdf' ? 'pdf' : d.mime === 'image/png' ? 'png' : 'jpg'}"`,
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    if (path[0] === 'notes' && path[1]) {
      const d = await detail(z.uuid().parse(path[1]));
      const { decrypt } = await import('@/lib/crypto');
      return Response.json(
        d.history.filter((h) => h.note).map((h) => ({ ...h, note: decrypt<string>(h.note!) })),
        { headers: privateHeaders },
      );
    }
    throw new HttpError(404, 'NOT_FOUND');
  }, 'admin');
}
export async function POST(req: Request, ctx: Context) {
  return endpoint(async () => {
    requireOrigin(req);
    const actor = await requireAdmin(),
      db = await store(),
      { path } = await ctx.params;
    if (path[0] !== 'applications' || !path[1]) throw new HttpError(404, 'NOT_FOUND');
    const id = z.uuid().parse(path[1]);
    if (!(await db.get(id))) throw new HttpError(404, 'NOT_FOUND');
    const body = z
      .object({
        action: z.enum(['status', 'note', 'request-deletion', 'delete']),
        status: z.enum(statuses).optional(),
        note: z.string().trim().max(2000).optional(),
        confirmation: z.string().optional(),
      })
      .parse(await jsonBody(req));
    if (body.action === 'status') {
      if (!body.status) throw new HttpError(422, 'STATUS_REQUIRED');
      try {
        await db.change(id, actor.id, body.status, body.note ? encrypt(body.note) : '');
      } catch {
        throw new HttpError(409, 'INVALID_TRANSITION');
      }
    }
    if (body.action === 'note') {
      if (!body.note) throw new HttpError(422, 'NOTE_REQUIRED');
      await db.note(id, actor.id, encrypt(body.note));
    }
    if (body.action === 'request-deletion') await db.deletion(id, actor.id, false);
    if (body.action === 'delete') {
      const a = await db.get(id);
      if (!a?.deletion_requested_at || body.confirmation !== a.reference)
        throw new HttpError(409, 'DELETION_CONFIRMATION_REQUIRED');
      for (const doc of await db.documents(id)) await deleteFile(doc.path);
      await db.deletion(id, actor.id, true);
    }
    return Response.json({ ok: true }, { headers: privateHeaders });
  }, 'admin');
}
