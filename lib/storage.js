import { get, put } from '@vercel/blob';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const local = process.env.ALPERA_LOCAL_STORAGE === '1' && !process.env.VERCEL;
const prefix = process.env.VERCEL_ENV === 'preview' ? 'preview/' : 'production/';
const root = process.env.ALPERA_DATA_DIR || join(process.cwd(), '.local-data');
const queues = new Map();
export function httpError(status, message) { return Object.assign(new Error(message), { status }); }
export function available() { return local || !!process.env.BLOB_STORE_ID; }
export async function readDocument(name) {
  if (!available()) throw httpError(503, 'Kalıcı depolama henüz bağlanmadı.');
  if (local) {
    try { const text = await readFile(join(root, name), 'utf8'); return { value: JSON.parse(text), etag: createHash('sha256').update(text).digest('hex') }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const result = await get(prefix + name, { access: 'private', useCache: false });
  if (!result) return null;
  return { value: await new Response(result.stream).json(), etag: result.blob.etag };
}
async function writeDocument(name, value, etag) {
  const text = JSON.stringify(value);
  if (local) {
    const existing = await readDocument(name);
    if ((existing?.etag || null) !== (etag || null)) throw httpError(409, 'Kayıt başka bir işlemde değişti.');
    await mkdir(root, { recursive: true });
    const temporary = join(root, name + '.' + randomUUID());
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, join(root, name));
    return;
  }
  await put(prefix + name, text, { access: 'private', addRandomSuffix: false, allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60 });
}
export async function mutateDocument(name, initial, change) {
  // Local development is single-process; production uses Blob's conditional ETags.
  const before = queues.get(name) || Promise.resolve();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  queues.set(name, before.then(() => waiting));
  await before;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await readDocument(name);
      const value = existing?.value || structuredClone(initial);
      const result = await change(value);
      try { await writeDocument(name, value, existing?.etag); return result; }
      catch (error) {
        if (attempt === 3 || !(error.status === 409 || /Precondition|AlreadyExists|Conflict/.test(error.name))) throw error;
      }
    }
  } finally { release(); }
}
export async function savePhoto(bytes, type) {
  const id = randomUUID();
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (local) {
    await mkdir(join(root, 'media'), { recursive: true });
    await writeFile(join(root, 'media', id + '.' + extension), bytes);
    return { id, url: '/local-media/' + id + '.' + extension };
  }
  if (!process.env.MEDIA_STORE_ID) throw httpError(503, 'Fotoğraf deposu bağlanmadı.');
  const blob = await put(prefix + 'photos/' + id + '.' + extension, bytes, { access: 'public', storeId: process.env.MEDIA_STORE_ID, addRandomSuffix: false, contentType: type, cacheControlMaxAge: 31536000 });
  return { id, url: blob.url };
}
