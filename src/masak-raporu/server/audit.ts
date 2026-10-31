import 'server-only';
import type { Sql } from './db';

/**
 * Denetim izine kayıt. details içine kişisel veri (ad, kimlik no, adres) YAZILMAZ; yalnızca kimlikler ve durumlar.
 * Kayıt, veritabanında hash zinciriyle bağlanır ve değiştirilemez.
 */
export async function audit(
  sql: Sql,
  organizationId: string,
  action: string,
  entityType: string | null = null,
  entityId: string | null = null,
  details: Record<string, unknown> = {},
  confidential = false,
) {
  await sql.query(
    `insert into masak.audit_events (organization_id, actor_id, action, entity_type, entity_id, details, confidential)
     values ($1, masak.uid(), $2, $3, $4, $5::jsonb, $6)`,
    [organizationId, action, entityType, entityId, JSON.stringify(details), confidential],
  );
}

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Oturum açıldı',
  'auth.logout': 'Oturum kapatıldı',
  'customer.created': 'Müşteri oluşturuldu',
  'customer.updated': 'Müşteri güncellendi',
  'customer.sensitive_viewed': 'Hassas bilgi görüntülendi',
  'identity_check.created': 'Kimlik teyit kaydı eklendi',
  'identity_check.confirmed': 'Kimlik teyidi onaylandı',
  'representative.created': 'Temsilci eklendi',
  'beneficial_owner.created': 'Gerçek faydalanıcı eklendi',
  'transaction.created': 'İşlem kaydedildi',
  'transaction.cancelled': 'İşlem iptal edildi',
  'transaction.corrected': 'İşlem düzeltildi',
  'transaction.evaluated': 'Kural değerlendirmesi yapıldı',
  'transactions.imported': 'CSV içe aktarıldı',
  'link_group.proposed': 'Bağlantı önerildi',
  'link_group.decided': 'Bağlantı kararı verildi',
  'alert.reviewed': 'Uyarı değerlendirildi',
  'case.submitted': 'İç inceleme oluşturuldu',
  'case.updated': 'İç inceleme güncellendi',
  'document.uploaded': 'Belge yüklendi',
  'document.download': 'Belge indirildi',
  'document.deletion_review': 'Belge silme değerlendirmesi',
  'report.exported': 'Rapor oluşturuldu',
  'audit_package.exported': 'Denetim paketi oluşturuldu',
  'member.invited': 'Personel davet edildi',
  'member.joined': 'Personel katıldı',
  'member.updated': 'Personel yetkisi değişti',
  'invitation.revoked': 'Davet iptal edildi',
  'rule.drafted': 'Kural taslağı',
  'rule.approved': 'Kural onaylandı',
  'rule.activated': 'Kural aktifleştirildi',
  'organization.updated': 'İşletme bilgisi güncellendi',
  'retention.updated': 'Saklama politikası güncellendi',
};
