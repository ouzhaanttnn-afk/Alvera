import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { raporConfig } from './config';

// Belgeler yalnızca özel depoya, uygulama katmanında şifrelenmiş olarak yazılır.
// Üretim: Supabase Storage "masak-raporu-private" (public=false) kovası, yalnızca sunucu (service role) erişir.
const BUCKET = 'masak-raporu-private';

export interface BlobStore {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

function localStore(): BlobStore {
  const root = resolve(raporConfig().dataDir, 'masak-raporu', 'files');
  const path = (key: string) => {
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error('INVALID_KEY');
    return p;
  };
  return {
    async put(key, data) {
      await mkdir(dirname(path(key)), { recursive: true });
      await writeFile(path(key), data, { flag: 'wx', mode: 0o600 });
    },
    get: async (key) => new Uint8Array(await readFile(path(key))),
  };
}

function supabaseStore(): BlobStore {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async put(key, data) {
      const { error } = await client.storage.from(BUCKET).upload(key, data, { contentType: 'application/octet-stream', upsert: false });
      if (error) throw new Error('STORAGE_WRITE_FAILED');
    },
    async get(key) {
      const { data, error } = await client.storage.from(BUCKET).download(key);
      if (error || !data) throw new Error('STORAGE_READ_FAILED');
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function blobStore(): BlobStore {
  return raporConfig().local ? localStore() : supabaseStore();
}
export { join };
