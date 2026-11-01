// MASAK müşteri formu sayfası: müşteriye personel bağlantısı gösterilmez, çıkışsız ekran kalmaz.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configuration = vi.hoisted(() => ({ pageConfiguration: vi.fn() }));
vi.mock('@/lib/config', () => configuration);
vi.mock('@/components/application-form', () => ({ ApplicationForm: () => null }));
vi.mock('@/components/brand', () => ({ Brand: () => null }));

async function render() {
  const { default: Page } = await import('@/app/masak-form/page');
  return renderToStaticMarkup(Page() as never);
}
// Süslü parantez şart: ok fonksiyonu sahte fonksiyonu döndürürse vitest bunu "temizlik" sanıp her testten sonra çağırır.
beforeEach(() => { configuration.pageConfiguration.mockReset(); });

describe('Form sayfası (açık)', () => {
  beforeEach(() => { configuration.pageConfiguration.mockReturnValue({ policy: { local: false, previewOnly: false }, notice: '' }); });

  it('başlıkta personel yönetim bağlantısı yoktur', async () => {
    const html = await render();
    expect(html).toContain('MASAK Form');
    expect(html).not.toContain('Yönetim paneli');
    expect(html).not.toContain('/masak-form/admin');
  });

  it('alt bilgi gerçek işletme adını taşır, dolgu cümlesi yoktur, aydınlatma bağlantısı kalır', async () => {
    const html = await render();
    expect(html).toContain(`© ${new Date().getFullYear()} Alvera Kuyumculuk`);
    expect(html).not.toContain('Alvera Form');
    expect(html).not.toContain('Özenle tasarlandı');
    expect(html).toContain('href="/masak-form/privacy"');
  });
});

describe('Başvurular açılmadı ekranı', () => {
  it('çıkışsız değildir: ana sayfa ve iletişim bağlantıları sunar', async () => {
    configuration.pageConfiguration.mockImplementation(() => { throw new Error('yapılandırma eksik'); });
    const html = await render();
    expect(html).toContain('Başvurular henüz açılmadı.');
    expect(html).toContain('href="/"');
    expect(html).toContain('Ana sayfaya dön');
    expect(html).toContain('href="/#iletisim"');
    expect(html).not.toContain('yapılandırma eksik'); // iç hata müşteriye sızmaz
  });
});
