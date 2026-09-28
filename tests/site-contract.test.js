import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage contains the critical user journeys', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['top','koleksiyon','fiyatlar','alvera','iletisim','ratesList','menuButton']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /tel:\+903123902425/);
  assert.match(html, /instagram\.com\/alvera_kuyumculuk/);
  assert.match(html, /altinkaynak\.com\/canli-kurlar\/altin/);
  assert.match(html, /prefers-reduced-motion|app\.js/);
});

test('price disclaimer is present', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /referans/i);
  assert.match(html, /farklılık gösterebilir/i);
});
