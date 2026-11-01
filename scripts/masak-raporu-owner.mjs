// ALVERA MASAK RAPORU — üretimde ilk işletmeyi ve ilk işletme sahibi davetini oluşturur.
// Kullanım (yalnızca yetkili sunucu yöneticisi, güvenli bir terminalden):
//   MASAK_DATABASE_URL=... APP_URL=https://... node scripts/masak-raporu-owner.mjs "Alvera Kuyumculuk" sahip@ornek.com
// Davet bağlantısı yalnızca bir kez ekrana yazılır; veritabanında yalnızca SHA-256 özeti saklanır (72 saat geçerli).
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const [name, email] = process.argv.slice(2);
if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Kullanım: node scripts/masak-raporu-owner.mjs "<İşletme adı>" <sahip-e-posta>');
  process.exit(1);
}
if (!process.env.MASAK_DATABASE_URL || !process.env.APP_URL?.startsWith('https://')) {
  console.error('MASAK_DATABASE_URL ve https ile başlayan APP_URL gerekli.');
  process.exit(1);
}
const sql = postgres(process.env.MASAK_DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });
const token = randomBytes(32).toString('base64url');
try {
  await sql.begin(async (tx) => {
    let [org] = await tx`select id from masak.organizations where name = ${name}`;
    if (!org) {
      [org] = await tx`insert into masak.organizations (name) values (${name}) returning id`;
      const basis = '5549 s. Kanun md. 8 (8 yıl) — hukuki doğrulama gerekiyor';
      for (const entity of ['customers', 'transactions', 'documents', 'risk_cases', 'audit_events', 'reports'])
        await tx`insert into masak.data_retention_policies (organization_id, entity_type, retention_years, basis) values (${org.id}, ${entity}, 8, ${basis})`;
    }
    await tx`insert into masak.invitations (organization_id, email, role, token_hash, expires_at)
             values (${org.id}, ${email.toLowerCase()}, 'owner', ${createHash('sha256').update(token).digest('hex')}, now() + interval '72 hours')`;
  });
  console.log(`İşletme sahibi daveti oluşturuldu (72 saat geçerli, tek kullanımlık):\n${process.env.APP_URL}/masak-raporu/davet?t=${token}`);
} finally {
  await sql.end();
}
