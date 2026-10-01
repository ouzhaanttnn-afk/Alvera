import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('A private credential output path is required.');
try { await access('lib/bootstrap.js'); throw new Error('Admin verifier already exists. Use the panel to change the password.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(24).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
await mkdir('lib', { recursive: true });
await writeFile('lib/bootstrap.js', '// One-way verifier for a randomly generated 192-bit initial password. Never store the plaintext here.\nexport const bootstrap = ' + JSON.stringify({ username: 'alvera', salt, hash }) + ';\n');
await writeFile(output, `ALVERA YONETIM PANELI\n\nAdres: https://alvera-ashy.vercel.app/admin\nKullanici adi: alvera\nSifre: ${password}\n\nBu dosya ozeldir. GitHub veya siteye yuklemeyin.\nPanelde Guvenlik bolumunden sifrenizi degistirebilirsiniz.\nFotograflar: JPEG, PNG veya WebP. Panel boyutlari otomatik kucultur.\n`, { mode: 0o600 });
console.log('Initial admin verifier created. Plaintext credentials saved only to the requested private file.');
