import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/prices.js';

function responseRecorder() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: null,
    setHeader(key, value) { headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('price API returns normalized official feed data', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { Kod: 'GA', Aciklama: 'Gram Altın', Alis: '6.600,00', Satis: '6.750,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
      { Kod: 'PC', Aciklama: 'Çeyrek', Alis: '10.600,00', Satis: '11.300,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
      { Kod: 'PY', Aciklama: 'Yarım', Alis: '21.000,00', Satis: '22.600,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
      { Kod: 'PT', Aciklama: 'Teklik', Alis: '42.000,00', Satis: '45.000,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
      { Kod: 'PA', Aciklama: 'Ata Cumhuriyet', Alis: '43.000,00', Satis: '47.000,00', GuncellenmeZamani: '28.09.2026 12:00:00' }
    ]
  });
  try {
    const res = responseRecorder();
    await handler({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, 'Altınkaynak');
    assert.equal(res.body.prices.length, 5);
    assert.equal(res.body.prices[0].name, 'Gram Altın');
  } finally {
    global.fetch = originalFetch;
  }
});

test('price API fails closed instead of returning invented/stale numbers', async () => {
  const originalFetch = global.fetch;
  const originalError = console.error;
  console.error = () => {};
  global.fetch = async () => { throw new Error('network down'); };
  try {
    const res = responseRecorder();
    await handler({}, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /ulaşılamıyor/i);
    assert.equal(res.body.prices, undefined);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
  }
});
