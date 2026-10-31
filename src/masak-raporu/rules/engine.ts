// Tarihe bağlı, açıklanabilir MASAK kontrol motoru.
// İlke: motor yalnızca gerekçeli UYARI üretir; hukuki sonuç (bildirim, ret, erteleme) çıkarmaz.
// Eşik üstü bir işlem "MASAK'a bildirilmeli" anlamına gelmez; kimlik tespiti yükümlülüğünü hatırlatır.
import { istanbulDate } from '../dates';
import { formatKurus } from '../money';

export type RuleKind =
  | 'threshold_single'
  | 'threshold_linked'
  | 'continuous_relationship'
  | 'suspicion'
  | 'identity_doubt'
  | 'missing_data'
  | 'risk_indicator';
export type Level = 'info' | 'review' | 'high';

export type Rule = {
  ruleKey: string;
  version: number;
  title: string;
  kind: RuleKind;
  level: Level;
  thresholdKurus: bigint | null;
  params: Record<string, unknown>;
  validFrom: string; // YYYY-MM-DD (dahil)
  validTo: string | null; // YYYY-MM-DD (dahil)
  sourceUrl: string;
  sourceArticle: string;
  status: 'draft' | 'approved' | 'active' | 'retired';
  /** İşletmeye özel kural (aynı göstergede sistem kuralının önüne geçer). */
  organizationSpecific?: boolean;
};

export type Tx = {
  id: string;
  number: string;
  occurredAt: string;
  totalTryKurus: bigint;
  status: 'draft' | 'completed' | 'cancelled' | 'superseded';
  type: string;
  paymentMethod: string;
  customerId: string;
  onBehalfOfCustomerId?: string | null;
  representativeId?: string | null;
};

export type CustomerFacts = {
  id: string;
  continuousRelationship: boolean;
  identityDoubt: boolean;
  hasVerifiedIdentity: boolean;
  missingFields: string[];
};

export type LinkGroup = { id: string; status: 'proposed' | 'confirmed' | 'rejected'; transactions: Tx[] };

export type EvaluationInput = {
  tx: Tx;
  customer: CustomerFacts;
  /** İşlemin yer aldığı bağlantı grupları (yalnızca "confirmed" olanlar toplanır). */
  groups: LinkGroup[];
  /** Aynı müşterinin, değerlendirme penceresindeki diğer işlemleri. */
  customerHistory: Tx[];
  /** İşlem gizli bir iç incelemeyle ilişkili mi (yalnızca yetkili kullanıcı bağlamında bilinir). */
  inRiskCase: boolean;
};

export type Finding = {
  fingerprint: string;
  ruleKey: string;
  ruleVersion: number;
  level: Level;
  title: string;
  rationale: string;
  sourceUrl: string;
  sourceArticle: string;
  confidential: boolean;
  transactionId: string;
  customerId: string;
  linkGroupId?: string;
  identityRequired: boolean;
};

const LIVE = new Set(['draft', 'completed']);

/** İşlem tarihinde yürürlükte olan aktif kural versiyonu. */
export function ruleAt(rules: Rule[], kind: RuleKind, day: string, indicator?: string): Rule | null {
  const matches = rules.filter(
    (r) =>
      r.kind === kind &&
      r.status === 'active' &&
      r.validFrom <= day &&
      (r.validTo === null || day <= r.validTo) &&
      (indicator === undefined || r.params.indicator === indicator),
  );
  if (matches.filter((m) => !m.organizationSpecific).length > 1 && indicator === undefined && kind !== 'risk_indicator')
    throw new Error(`RULE_OVERLAP:${kind}:${day}`);
  return matches.sort((a, b) => Number(Boolean(b.organizationSpecific)) - Number(Boolean(a.organizationSpecific)) || b.version - a.version)[0] || null;
}

function finding(rule: Rule, tx: Tx, f: Partial<Finding> & Pick<Finding, 'fingerprint' | 'rationale'>): Finding {
  return {
    ruleKey: rule.ruleKey,
    ruleVersion: rule.version,
    level: rule.level,
    title: rule.title,
    sourceUrl: rule.sourceUrl,
    sourceArticle: rule.sourceArticle,
    confidential: false,
    transactionId: tx.id,
    customerId: tx.customerId,
    identityRequired: false,
    ...f,
  };
}

export function evaluate(rules: Rule[], input: EvaluationInput): Finding[] {
  const { tx, customer } = input;
  if (!LIVE.has(tx.status)) return [];
  const day = istanbulDate(tx.occurredAt);
  const out: Finding[] = [];
  const verified = customer.hasVerifiedIdentity;
  const identityLevel = (base: Level): Level => (verified ? 'info' : base);
  const identityNote = verified
    ? ' Müşteri için onaylanmış kimlik teyit kaydı mevcut.'
    : ' Onaylanmış kimlik tespit/teyit kaydı bulunamadı.';

  // 1) Tekil işlem eşiği
  const single = ruleAt(rules, 'threshold_single', day);
  if (single?.thresholdKurus && tx.totalTryKurus >= single.thresholdKurus) {
    out.push(
      finding(single, tx, {
        fingerprint: `${single.ruleKey}:tx:${tx.id}`,
        level: identityLevel(single.level),
        identityRequired: true,
        rationale: `İşlem tutarı ${formatKurus(tx.totalTryKurus)}, ${day} tarihinde yürürlükte olan ${formatKurus(single.thresholdKurus)} eşiğine eşit veya üzerinde (kural ${single.ruleKey} v${single.version}).${identityNote}`,
      }),
    );
  }

  // 2) Yetkili kişi tarafından "bağlantılı" olarak onaylanmış işlemler toplamı
  for (const group of input.groups.filter((g) => g.status === 'confirmed')) {
    const live = group.transactions.filter((t) => LIVE.has(t.status));
    if (live.length < 2) continue;
    const latest = live.map((t) => istanbulDate(t.occurredAt)).sort().at(-1)!;
    const rule = ruleAt(rules, 'threshold_linked', latest);
    if (!rule?.thresholdKurus) continue;
    const sum = live.reduce((a, t) => a + t.totalTryKurus, 0n);
    if (sum >= rule.thresholdKurus) {
      out.push(
        finding(rule, tx, {
          fingerprint: `${rule.ruleKey}:group:${group.id}:tx:${tx.id}`,
          level: identityLevel(rule.level),
          linkGroupId: group.id,
          identityRequired: true,
          rationale: `Yetkili tarafından bağlantılı kabul edilen ${live.length} işlemin toplamı ${formatKurus(sum)} (${live
            .map((t) => `${t.number}: ${formatKurus(t.totalTryKurus)}`)
            .join(' + ')}); ${latest} tarihli ${formatKurus(rule.thresholdKurus)} eşiğine ulaşıyor.${identityNote}`,
        }),
      );
    }
  }

  // 3) Tutardan bağımsız kimlik tespiti halleri
  const cont = ruleAt(rules, 'continuous_relationship', day);
  if (cont && customer.continuousRelationship)
    out.push(
      finding(cont, tx, {
        fingerprint: `${cont.ruleKey}:tx:${tx.id}`,
        level: identityLevel(cont.level),
        identityRequired: true,
        rationale: `Müşteriyle sürekli iş ilişkisi kaydı var; kimlik tespiti tutara bakılmaksızın gerekir.${identityNote}`,
      }),
    );
  const susp = ruleAt(rules, 'suspicion', day);
  if (susp && input.inRiskCase)
    out.push(
      finding(susp, tx, {
        fingerprint: `${susp.ruleKey}:tx:${tx.id}`,
        confidential: true,
        identityRequired: true,
        rationale: `İşlem bir iç şüphe değerlendirmesiyle ilişkili. Şüpheli işlem bildirimini gerektiren durumlarda kimlik tespiti tutara bakılmaksızın yapılır. Bu bilgi müşteriyle veya yetkisiz personelle paylaşılmamalıdır.`,
      }),
    );
  const doubt = ruleAt(rules, 'identity_doubt', day);
  if (doubt && customer.identityDoubt)
    out.push(
      finding(doubt, tx, {
        fingerprint: `${doubt.ruleKey}:tx:${tx.id}`,
        identityRequired: true,
        rationale: `Müşterinin daha önce alınan kimlik bilgilerinin yeterliliği veya doğruluğu konusunda şüphe işaretlenmiş; kimlik tespiti tutara bakılmaksızın yenilenmelidir.`,
      }),
    );

  // 4) Kimlik tespiti gerekiyorsa eksik veri
  const required = out.some((f) => f.identityRequired);
  const missing = ruleAt(rules, 'missing_data', day);
  if (missing && required && customer.missingFields.length)
    out.push(
      finding(missing, tx, {
        fingerprint: `${missing.ruleKey}:tx:${tx.id}`,
        rationale: `Kimlik tespiti gereken işlem için müşteri kaydında eksik alanlar: ${customer.missingFields.join(', ')}.`,
      }),
    );

  // 5) Risk göstergeleri (yalnızca inceleme önerisi)
  const history = input.customerHistory.filter((t) => t.id !== tx.id && LIVE.has(t.status));
  const possible = ruleAt(rules, 'risk_indicator', day, 'possible_linked');
  const base = single?.thresholdKurus;
  if (possible && base) {
    const windowDays = Number(possible.params.windowDays ?? 7);
    const linkedIds = new Set(input.groups.filter((g) => g.status !== 'proposed').flatMap((g) => g.transactions.map((t) => t.id)));
    const near = history.filter((t) => !linkedIds.has(t.id) && withinDays(t.occurredAt, tx.occurredAt, windowDays));
    const sum = near.reduce((a, t) => a + t.totalTryKurus, tx.totalTryKurus);
    if (near.length && tx.totalTryKurus < base && sum >= base)
      out.push(
        finding(possible, tx, {
          fingerprint: `${possible.ruleKey}:tx:${tx.id}`,
          rationale: `Aynı müşterinin ${windowDays} gün içindeki ${near.length + 1} işleminin toplamı ${formatKurus(sum)}. Bu işlemler otomatik olarak bağlantılı kabul EDİLMEDİ; müşteri, temsil, zaman, belge ve ödeme bağlamı yetkili kişi tarafından değerlendirilmelidir.`,
        }),
      );
  }
  const structuring = ruleAt(rules, 'risk_indicator', day, 'below_threshold_repeat');
  if (structuring && base) {
    const windowDays = Number(structuring.params.windowDays ?? 7);
    const ratio = BigInt(Math.round(Number(structuring.params.lowerRatio ?? 0.8) * 100));
    const lower = (base * ratio) / 100n;
    const band = (t: Tx) => t.totalTryKurus >= lower && t.totalTryKurus < base;
    const peers = history.filter((t) => band(t) && withinDays(t.occurredAt, tx.occurredAt, windowDays));
    if (band(tx) && peers.length >= 1)
      out.push(
        finding(structuring, tx, {
          fingerprint: `${structuring.ruleKey}:tx:${tx.id}`,
          rationale: `Müşterinin ${windowDays} gün içinde eşiğin hemen altında (${formatKurus(lower)} – ${formatKurus(base)}) ${peers.length + 1} işlemi var. Örnek risk göstergesi olarak inceleme önerilir; tek başına şüphe sonucu doğurmaz.`,
        }),
      );
  }
  const cash = ruleAt(rules, 'risk_indicator', day, 'large_cash');
  if (cash && base && tx.paymentMethod === 'nakit' && tx.totalTryKurus >= base)
    out.push(
      finding(cash, tx, {
        fingerprint: `${cash.ruleKey}:tx:${tx.id}`,
        rationale: `Eşik üstü tutar nakit ödendi (${formatKurus(tx.totalTryKurus)}). Fonun kaynağı ve işlemin ekonomik amacı açıklama alanında belgelenmelidir.`,
      }),
    );
  const rep = ruleAt(rules, 'risk_indicator', day, 'on_behalf_without_representative');
  if (rep && tx.onBehalfOfCustomerId && !tx.representativeId)
    out.push(
      finding(rep, tx, {
        fingerprint: `${rep.ruleKey}:tx:${tx.id}`,
        rationale: `İşlem başkası adına yapılmış görünüyor ancak temsilci/vekil kaydı ilişkilendirilmemiş. Adına işlem yapılan kişi ve yetki belgesi kaydedilmelidir.`,
      }),
    );
  const scrap = ruleAt(rules, 'risk_indicator', day, 'large_scrap');
  if (scrap && base && tx.type === 'scrap_gold_purchase' && tx.totalTryKurus >= base)
    out.push(
      finding(scrap, tx, {
        fingerprint: `${scrap.ruleKey}:tx:${tx.id}`,
        rationale: `Eşik üstü hurda altın alışı (${formatKurus(tx.totalTryKurus)}). Ürünün kaynağı ve müşterinin açıklaması kayda alınmalıdır.`,
      }),
    );
  const resale = ruleAt(rules, 'risk_indicator', day, 'quick_resale');
  if (resale && ['gold_purchase', 'scrap_gold_purchase'].includes(tx.type)) {
    const windowDays = Number(resale.params.windowDays ?? 14);
    const sold = history.filter((t) => ['gold_sale', 'jewelry_sale', 'bullion'].includes(t.type) && t.occurredAt <= tx.occurredAt && withinDays(t.occurredAt, tx.occurredAt, windowDays));
    if (sold.length)
      out.push(
        finding(resale, tx, {
          fingerprint: `${resale.ruleKey}:tx:${tx.id}`,
          rationale: `Müşteriye ${windowDays} gün içinde satış yapılmış (${sold.map((t) => t.number).join(', ')}) ve şimdi müşteriden alış yapılıyor. Ödeme yöntemleri ve gerekçe değerlendirilmelidir.`,
        }),
      );
  }
  return out;
}

function withinDays(a: string, b: string, days: number) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * 86_400_000;
}

export const LEVEL_LABELS: Record<Level, string> = { info: 'Bilgi', review: 'İnceleme Gerekli', high: 'Yüksek Öncelik' };
