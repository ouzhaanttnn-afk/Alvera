import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAltinkaynak } from '../lib/altinkaynak.js';

test('filters, labels and orders the Altınkaynak payload', () => {
  const payload = [
    { Kod: 'PC', Aciklama: 'Çeyrek', Alis: '10.600,00', Satis: '11.300,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
    { Kod: 'IGNORED', Aciklama: 'Other', Alis: '1', Satis: '2', GuncellenmeZamani: 'x' },
    { Kod: 'GA', Aciklama: 'Gram Altın', Alis: '6.600,00', Satis: '6.750,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
    { Kod: 'PA', Aciklama: 'Ata Cumhuriyet', Alis: '43.000,00', Satis: '47.000,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
    { Kod: 'PY', Aciklama: 'Yarım', Alis: '21.000,00', Satis: '22.600,00', GuncellenmeZamani: '28.09.2026 12:00:00' },
    { Kod: 'PT', Aciklama: 'Teklik', Alis: '42.000,00', Satis: '45.000,00', GuncellenmeZamani: '28.09.2026 12:00:00' }
  ];
  const result = normalizeAltinkaynak(payload);
  assert.deepEqual(result.prices.map((x) => x.code), ['GA', 'PC', 'PY', 'PT', 'PA']);
  assert.equal(result.prices[0].name, 'Gram Altın');
  assert.equal(result.prices[3].name, 'Tam Altın');
  assert.equal(result.updated, '28.09.2026 12:00:00');
});

test('throws for malformed non-array payload', () => {
  assert.throws(() => normalizeAltinkaynak({}), /must be an array/);
});

test('drops incomplete prices instead of fabricating values', () => {
  const result = normalizeAltinkaynak([{ Kod: 'GA', Alis: '', Satis: '', GuncellenmeZamani: 'x' }]);
  assert.equal(result.prices.length, 0);
});
