import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
if (existsSync('.env.local')) {
  console.log('.env.local mevcut; değiştirilmedi.');
  process.exit(0);
}
const key = () => randomBytes(32).toString('base64');
writeFileSync(
  '.env.local',
  `APP_MODE=local\nAPP_URL=http://127.0.0.1:3000\nDATA_ENCRYPTION_KEY=${key()}\nTOKEN_SECRET=${key()}\nCRON_SECRET=${key()}\nLOCAL_ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\nLOCAL_ADMIN_TOTP_CODE=${randomInt(100000, 1000000)}\nDOCUMENTS_ENABLED=false\nSIGNATURE_ENABLED=false\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Yerel ayarlar .env.local içine oluşturuldu. Giriş bilgilerini bu dosyadan okuyun; Git ile paylaşmayın.',
);
