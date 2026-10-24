import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config, publicPolicy } from './config';
import { decrypt, encrypt } from './crypto';
import { store } from './db';
import { applicationSchema, maskIdentity } from './validation';
import { HttpError } from './security';
import type { ApplicationData, Detail } from './types';
export async function submit(intake: string, input: unknown, docIds: unknown) {
  const c = config(),
    db = await store();
  const old = await db.byIntake(intake);
  if (old) return { reference: old.reference };
  const parsed = applicationSchema(publicPolicy()).safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_FIELDS');
  const ids = z.array(z.uuid()).max(4).parse(docIds);
  const docs = await Promise.all(ids.map((id) => db.document(id)));
  if (docs.some((d) => !d || d.intake_id !== intake || d.application_id)) {
    // A parallel request may have committed while document metadata was being read.
    const committed = await db.byIntake(intake);
    if (committed) return { reference: committed.reference };
    throw new HttpError(403, 'DOCUMENT_DENIED');
  }
  const kinds = docs.map((d) => d!.kind);
  if (new Set(kinds).size !== kinds.length) throw new HttpError(422, 'DUPLICATE_DOCUMENT_KIND');
  if (
    (!c.documents && kinds.some((k) => k === 'front' || k === 'back')) ||
    (!c.signature && kinds.includes('signature')) ||
    (!c.residence && kinds.includes('residence'))
  )
    throw new HttpError(403, 'COLLECTION_DISABLED');
  if (
    (c.documents && (!kinds.includes('front') || !kinds.includes('back'))) ||
    (c.signature && !kinds.includes('signature')) ||
    (c.residenceRequired && !kinds.includes('residence'))
  )
    throw new HttpError(422, 'DOCUMENTS_REQUIRED');
  const a = await db.submit({
    id: randomUUID(),
    intake,
    payload: encrypt(parsed.data),
    kind: parsed.data.kind,
    masked: maskIdentity(parsed.data.identityNumber),
    notice: c.noticeVersion,
    documents: ids,
    receipt: process.env.SEND_APPLICANT_RECEIPT === 'true' && !!parsed.data.email,
  });
  return { reference: a.reference };
}
export async function detail(id: string): Promise<Detail> {
  const db = await store(),
    a = await db.get(id);
  if (!a) throw new HttpError(404, 'NOT_FOUND');
  const [documents, history, notifications] = await Promise.all([
    db.documents(id),
    db.history(id),
    db.outbox(id),
  ]);
  return {
    application: a,
    data: decrypt<ApplicationData>(a.payload),
    documents,
    history,
    notifications,
  };
}
