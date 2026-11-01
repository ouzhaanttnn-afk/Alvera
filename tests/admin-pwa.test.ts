// Yönetim paneli ana ekrana eklenebilir; herkese açık sayfada panele giden bağlantı yoktur.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const manifest = JSON.parse(read('assets/admin/manifest.webmanifest'));

function pngSize(file: string) {
  const bytes = readFileSync(join(root, file));
  expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${file} PNG değil`).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('Yönetim paneli manifesti', () => {
  it('uygulama olarak kurulmak için gerekenleri taşır', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(14); // ana ekranda kesilmesin
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('tr');
    expect(manifest.start_url).toBe('/admin');
    expect(manifest.scope).toBe('/admin');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    for (const key of ['background_color', 'theme_color']) expect(manifest[key], key).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('kapsamı yalnızca panelle sınırlıdır: herkese açık sayfa uygulamaya dahil olmaz', () => {
    expect('/').not.toMatch(new RegExp(`^${manifest.scope}`));
    expect('/masak-form').not.toMatch(new RegExp(`^${manifest.scope}`));
  });

  it('ikonlar gerçekten bildirilen boyutta; 192 ve 512 ile maskable var', () => {
    const purposes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(icon.src.startsWith('/')).toBe(true);
      expect(icon.type).toBe('image/png');
      expect(pngSize(icon.src.slice(1)), icon.src).toEqual({ width: w, height: h });
    }
    expect(pngSize('assets/admin/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });
});

describe('Yönetim sayfası', () => {
  const admin = read('admin.html');
  it('manifest, iOS ikonu ve ana ekran etiketlerini bağlar; arama motorlarına kapalı kalır', () => {
    expect(admin).toContain('<link rel="manifest" href="/assets/admin/manifest.webmanifest" />');
    expect(admin).toContain('<link rel="apple-touch-icon" href="/assets/admin/apple-touch-icon.png" />');
    expect(admin).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(admin).toContain('name="apple-mobile-web-app-title" content="Alvera Yönetim"');
    expect(admin).toMatch(/name="robots" content="noindex, nofollow"/);
  });
});

describe('Herkese açık site', () => {
  it('yönetim paneline giden bağlantı içermez', () => {
    const home = read('index.html');
    expect(home).not.toMatch(/href="\/admin/);
    expect(home).not.toContain('Yönetim paneli');
    expect(read('robots.txt')).toContain('Disallow: /admin');
  });
});
