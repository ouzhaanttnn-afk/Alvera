import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, PDFName } from 'pdf-lib';
import { config } from './config';
import { supabase } from './db';
import { HttpError } from './security';
export async function validateFile(bytes: Buffer, name: string, mime: string, signature = false) {
  const c = config();
  if (!bytes.length || bytes.length > c.maxUploadMB * 1024 * 1024)
    throw new HttpError(413, 'FILE_TOO_LARGE');
  const ext = name.toLowerCase().split('.').pop();
  let actual = '';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    actual = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) actual = 'image/jpeg';
  else if (bytes.subarray(0, 5).toString() === '%PDF-') actual = 'application/pdf';
  if (
    !actual ||
    actual !== mime ||
    !(actual === 'image/png'
      ? ext === 'png'
      : actual === 'image/jpeg'
        ? ['jpg', 'jpeg'].includes(ext || '')
        : ext === 'pdf') ||
    (signature && actual !== 'image/png')
  )
    throw new HttpError(400, 'INVALID_FILE_TYPE');
  try {
    if (actual === 'application/pdf') {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
      if (!pdf.getPageCount() || pdf.getPageCount() > 10) throw 0;
      const raw = bytes.toString('latin1');
      if (
        /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|XFA)\b/.test(raw) ||
        pdf.catalog.has(PDFName.of('OpenAction')) ||
        pdf.catalog.has(PDFName.of('AA'))
      )
        throw 0;
    } else {
      const image = sharp(bytes, { limitInputPixels: 16000000, animated: false });
      const meta = await image.metadata();
      if (!meta.width || !meta.height || meta.width < 10 || meta.height < 10) throw 0;
      bytes = actual === 'image/png' ? await image.png().toBuffer() : await image.jpeg().toBuffer();
      if (signature) {
        const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 64 && pixels[i] + pixels[i + 1] + pixels[i + 2] < 600) ink++;
        }
        if (ink < 20) throw 0;
      }
    }
  } catch {
    throw new HttpError(400, 'INVALID_FILE_CONTENT');
  }
  if (!c.local) {
    const scan = await fetch(process.env.FILE_SCAN_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.FILE_SCAN_TOKEN}`, 'Content-Type': actual },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(30000),
    });
    if (!scan.ok || (await scan.json()).clean !== true)
      throw new HttpError(422, 'FILE_SCAN_REJECTED');
  }
  return {
    bytes,
    mime: actual,
    extension: actual === 'application/pdf' ? 'pdf' : actual === 'image/png' ? 'png' : 'jpg',
  };
}
export async function putFile(intake: string, bytes: Buffer, extension: string, mime: string) {
  const path = `${intake}/${randomUUID()}.${extension}`;
  if (config().local) {
    const dir = join(config().dataDir, 'private', intake);
    await mkdir(dir, { recursive: true });
    await writeFile(join(config().dataDir, 'private', path), bytes, { mode: 0o600 });
  } else {
    const { error } = await supabase()
      .storage.from('application-private')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error('STORAGE_FAILED');
  }
  return path;
}
function validPath(path: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|pdf)$/.test(path)) throw new Error('INVALID_PATH');
}
export async function getFile(path: string) {
  validPath(path);
  const c = config('admin');
  if (c.local) return readFile(join(c.dataDir, 'private', path));
  const { data, error } = await supabase().storage.from('application-private').download(path);
  if (error || !data) throw new Error('STORAGE_FAILED');
  return Buffer.from(await data.arrayBuffer());
}
export async function deleteFile(path: string) {
  validPath(path);
  const c = config('admin');
  if (c.local) await rm(join(c.dataDir, 'private', path), { force: true });
  else {
    const { error } = await supabase().storage.from('application-private').remove([path]);
    if (error) throw new Error('STORAGE_FAILED');
  }
}
