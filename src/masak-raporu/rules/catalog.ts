// Sistem geneli kural kataloğu. Migration'daki seed ile aynı değerleri taşır; testler ikisinin eşitliğini doğrular.
// Yürürlük tarihleri ve maddeler docs/masak-raporu/MEVZUAT.md içinde kaynaklandırılmıştır.
// "legalReviewRequired" true olan kurallar için hukuki doğrulama gerekir.
import type { Rule } from './engine';

const YONETMELIK = 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=200713012&MevzuatTur=21&MevzuatTertip=5';
const RG_2026 = 'https://www.resmigazete.gov.tr/eskiler/2026/10/20261007-9.pdf';
const REHBER = 'https://ms.hmb.gov.tr/uploads/sites/12/2025/06/SIB-REHBER-KUYUMCULAR-2.0-19936ffcf75ce5f9.pdf';
const VERIFIED = '2026-10-31';

type Seed = Omit<Rule, 'status' | 'thresholdKurus'> & { thresholdTl: number | null; scope: string; lastVerifiedAt: string; legalReviewRequired: boolean };

// Tedbirler Yönetmeliği md. 5/1-b eşik tarihçesi (RG ve yürürlük tarihleri MEVZUAT.md'de).
const THRESHOLDS: [number, string, string | null, string, string][] = [
  [20000, '2008-04-01', '2021-04-30', YONETMELIK, 'Tedbirler Yön. md. 5/1-b (asıl metin, RG 9/1/2008-26751)'],
  [75000, '2021-05-01', '2022-06-15', YONETMELIK, 'Tedbirler Yön. md. 5/1-b (CK 3580, RG 24/2/2021-31405 Mük.)'],
  [85000, '2022-06-16', '2023-01-31', YONETMELIK, 'Tedbirler Yön. md. 5/1-b (CK 5739, RG 16/6/2022-31868)'],
  [185000, '2023-02-01', '2026-10-06', YONETMELIK, 'Tedbirler Yön. md. 5/1-b (CK 6702, RG 14/1/2023-32073)'],
  [370000, '2026-10-07', null, RG_2026, 'Tedbirler Yön. md. 5/1-b (CK 11845, RG 7/10/2026-33393)'],
];

export const RULE_CATALOG: Seed[] = [
  ...THRESHOLDS.map(([tl, from, to, url, article], i): Seed => ({
    ruleKey: 'KT-ESIK', version: i + 1, kind: 'threshold_single', level: 'high', thresholdTl: tl,
    title: 'Tekil işlem kimlik tespiti eşiği', scope: 'Tutarı eşik ve üzerindeki tek işlem; kimlik tespiti işlemden önce tamamlanır (md. 5/2)',
    validFrom: from, validTo: to, params: {}, sourceUrl: url, sourceArticle: article, lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  })),
  ...THRESHOLDS.map(([tl, from, to, url, article], i): Seed => ({
    ruleKey: 'KT-BAGLANTILI', version: i + 1, kind: 'threshold_linked', level: 'high', thresholdTl: tl,
    title: 'Birbiriyle bağlantılı işlemler toplamı kimlik tespiti eşiği',
    scope: 'Yalnızca yetkili kişinin bağlantılı kabul ettiği işlemler; "bağlantılı işlem" mevzuatta tanımlı değildir, iç politika uygulanır',
    validFrom: from, validTo: to, params: {}, sourceUrl: url, sourceArticle: `${article}; bkz. md. 32/2 ve 27/3`, lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  })),
  {
    ruleKey: 'KT-SUREKLI', version: 1, kind: 'continuous_relationship', level: 'high', thresholdTl: null,
    title: 'Sürekli iş ilişkisinde kimlik tespiti', scope: 'Tutardan bağımsız',
    validFrom: '2008-04-01', validTo: null, params: {}, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 5/1-a', lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  },
  {
    ruleKey: 'KT-SUPHE', version: 1, kind: 'suspicion', level: 'high', thresholdTl: null,
    title: 'Şüpheli işlem bildirimini gerektiren durumda kimlik tespiti', scope: 'Tutardan bağımsız, gizli (5549 s. Kanun md. 4/2; Yön. md. 29)',
    validFrom: '2008-04-01', validTo: null, params: {}, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 5/1-d; MASAK Genel Tebliği Sıra No 13 md. 4/5', lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  },
  {
    ruleKey: 'KT-DOGRULUK', version: 1, kind: 'identity_doubt', level: 'review', thresholdTl: null,
    title: 'Önceki kimlik bilgisinin yeterliliği veya doğruluğundan şüphe', scope: 'Tutardan bağımsız; teyit yapılamazsa md. 22/2',
    validFrom: '2008-04-01', validTo: null, params: {}, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 5/1-e, md. 22/2', lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  },
  {
    ruleKey: 'VERI-EKSIK', version: 1, kind: 'missing_data', level: 'review', thresholdTl: null,
    title: 'Kimlik tespiti için eksik müşteri bilgisi', scope: 'Kimlik tespiti gereken işlemler',
    validFrom: '2008-04-01', validTo: null, params: {}, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 6 (gerçek kişi), md. 7 (tüzel kişi), md. 14, 17, 17/A', lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  },
  {
    ruleKey: 'RG-OLASI-BAGLANTI', version: 1, kind: 'risk_indicator', level: 'info', thresholdTl: null,
    title: 'Olası bağlantılı işlem (insan değerlendirmesi gerekli)', scope: 'Aynı müşteri, kısa süre, toplam eşik üstü — iç politika',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'possible_linked', windowDays: 7 }, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 5/1-b, 27/3, 32/2 (resmî tanım yok)', lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  },
  {
    ruleKey: 'RG-ESIK-ALTI', version: 1, kind: 'risk_indicator', level: 'review', thresholdTl: null,
    title: 'Eşiğin hemen altında tekrarlayan işlemler', scope: 'Örnek şüpheli işlem tipi — tek başına sonuç doğurmaz',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'below_threshold_repeat', windowDays: 7, lowerRatio: 0.8 }, sourceUrl: REHBER,
    sourceArticle: 'Kuyumcular ŞİB Rehberi 2.0, T-008-2.5 / T-008-2.8 (işlemin bölünmesi)', lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  },
  {
    ruleKey: 'RG-NAKIT', version: 1, kind: 'risk_indicator', level: 'info', thresholdTl: null,
    title: 'Eşik üstü nakit ödeme', scope: 'Örnek şüpheli işlem tipi — tek başına sonuç doğurmaz',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'large_cash' }, sourceUrl: REHBER,
    sourceArticle: 'Kuyumcular ŞİB Rehberi 2.0, T-008-2.18 / 2.20 / 2.32', lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  },
  {
    ruleKey: 'RG-TEMSIL', version: 1, kind: 'risk_indicator', level: 'review', thresholdTl: null,
    title: 'Başkası adına işlemde temsil bilgisi eksik', scope: 'Başkası adına/hesabına işlem',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'on_behalf_without_representative' }, sourceUrl: YONETMELIK,
    sourceArticle: 'Tedbirler Yön. md. 14, md. 17/2; Kuyumcular ŞİB Rehberi T-008-2.7', lastVerifiedAt: VERIFIED, legalReviewRequired: false,
  },
  {
    ruleKey: 'RG-HURDA', version: 1, kind: 'risk_indicator', level: 'review', thresholdTl: null,
    title: 'Yüksek tutarlı hurda altın alışı', scope: 'Örnek şüpheli işlem tipi — tek başına sonuç doğurmaz',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'large_scrap' }, sourceUrl: REHBER,
    sourceArticle: 'Kuyumcular ŞİB Rehberi 2.0, T-008-2.29', lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  },
  {
    ruleKey: 'RG-HIZLI-GERI-SATIS', version: 1, kind: 'risk_indicator', level: 'info', thresholdTl: null,
    title: 'Kısa süre önce satılan ürünün geri alınması', scope: 'Örnek şüpheli işlem tipi — tek başına sonuç doğurmaz',
    validFrom: '2008-04-01', validTo: null, params: { indicator: 'quick_resale', windowDays: 14 }, sourceUrl: REHBER,
    sourceArticle: 'Kuyumcular ŞİB Rehberi 2.0, T-008-2.26', lastVerifiedAt: VERIFIED, legalReviewRequired: true,
  },
];

export function catalogRules(): Rule[] {
  return RULE_CATALOG.map((r) => ({
    ruleKey: r.ruleKey, version: r.version, title: r.title, kind: r.kind, level: r.level,
    thresholdKurus: r.thresholdTl === null ? null : BigInt(r.thresholdTl) * 100n,
    params: r.params, validFrom: r.validFrom, validTo: r.validTo, sourceUrl: r.sourceUrl, sourceArticle: r.sourceArticle,
    status: 'active',
  }));
}

export function catalogSeedSql(): string {
  const q = (v: unknown) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  return RULE_CATALOG.map(
    (r) =>
      `insert into masak.compliance_rules (organization_id, rule_key, version, title, scope, kind, level, threshold_kurus, params, valid_from, valid_to, source_url, source_article, last_verified_at, legal_review_required, status) values (null, ${q(r.ruleKey)}, ${r.version}, ${q(r.title)}, ${q(r.scope)}, ${q(r.kind)}, ${q(r.level)}, ${r.thresholdTl === null ? 'null' : r.thresholdTl * 100}, ${q(JSON.stringify(r.params))}::jsonb, ${q(r.validFrom)}, ${q(r.validTo)}, ${q(r.sourceUrl)}, ${q(r.sourceArticle)}, ${q(r.lastVerifiedAt)}, ${r.legalReviewRequired}, 'active') on conflict do nothing;`,
  ).join('\n');
}
