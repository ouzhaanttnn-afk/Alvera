// Uygulama katmanındaki izin matrisi. Veritabanındaki masak.role_permissions() ile birebir aynıdır;
// tests/masak-raporu/db.test.ts bu eşitliği doğrular. Asıl yetki kontrolü veritabanında (RLS) da yapılır.

export const ROLES = ['owner', 'manager', 'compliance_officer', 'staff', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'records.read',
  'records.write',
  'sensitive.view',
  'documents.download',
  'documents.upload',
  'export.data',
  'reports.confidential',
  'cases.create',
  'cases.view',
  'cases.manage',
  'links.decide',
  'alerts.review',
  'rules.manage',
  'rules.approve',
  'members.manage',
  'settings.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Rol varsayılanına ek olarak kişi bazında verilebilen/geri alınabilen izinler. */
export const ADJUSTABLE: Permission[] = ['sensitive.view', 'documents.download', 'export.data'];

const all = [...PERMISSIONS];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: all,
  manager: [
    'records.read', 'records.write', 'sensitive.view', 'documents.download', 'documents.upload', 'export.data',
    'cases.create', 'links.decide', 'alerts.review', 'rules.manage', 'members.manage', 'settings.manage', 'audit.view',
  ],
  compliance_officer: [
    'records.read', 'records.write', 'sensitive.view', 'documents.download', 'documents.upload', 'export.data',
    'reports.confidential', 'cases.create', 'cases.view', 'cases.manage', 'links.decide', 'alerts.review',
    'rules.manage', 'rules.approve', 'audit.view',
  ],
  staff: ['records.read', 'records.write', 'documents.upload', 'cases.create'],
  auditor: ['records.read', 'export.data', 'audit.view'],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'İşletme Sahibi',
  manager: 'Yönetici',
  compliance_officer: 'Uyum Yetkilisi',
  staff: 'Personel',
  auditor: 'Salt Okunur Denetçi',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'records.read': 'Kayıtları görüntüleme',
  'records.write': 'Müşteri ve işlem kaydı',
  'sensitive.view': 'Hassas bilgileri açık görme',
  'documents.download': 'Belge indirme',
  'documents.upload': 'Belge yükleme',
  'export.data': 'Rapor ve dışa aktarma',
  'reports.confidential': 'Gizli raporlar',
  'cases.create': 'Şüphe bildirimi (iç)',
  'cases.view': 'İç incelemeleri görme',
  'cases.manage': 'İç incelemeleri yönetme',
  'links.decide': 'Bağlantılı işlem kararı',
  'alerts.review': 'Uyarı değerlendirme',
  'rules.manage': 'Kural taslağı',
  'rules.approve': 'Kural onayı',
  'members.manage': 'Personel yönetimi',
  'settings.manage': 'İşletme ayarları',
  'audit.view': 'Denetim izi',
};

export function effectivePermissions(role: Role, granted: string[] = [], revoked: string[] = []): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role].filter((p) => !revoked.includes(p)));
  for (const p of granted) if ((ADJUSTABLE as string[]).includes(p)) set.add(p as Permission);
  return set;
}
