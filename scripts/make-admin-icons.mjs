// Yönetim paneli ana ekran ikonlarını marka monogramından üretir: `node scripts/make-admin-icons.mjs`
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('assets/alvera-monogram.svg');
const INK = '#102a32'; // yönetim panelinin lacivert tonu: altın monogram bu zeminde okunur
await mkdir('assets/admin', { recursive: true });

async function icon(file, size, logoShare) {
  const logo = await sharp(svg, { density: 900 }).resize({ width: Math.round(size * logoShare) }).png().toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(`assets/admin/${file}`, png);
  console.log(file, size + 'x' + size, (png.length / 1024).toFixed(1) + ' KB');
}
// "any": simge olduğu gibi gösterilir. "maskable": Android'in daire/yuvarlatılmış maskesi kenarları keser;
// logo, güvenli alan olan orta %60'ın içinde kalır.
await icon('icon-192.png', 192, 0.66);
await icon('icon-512.png', 512, 0.66);
await icon('icon-maskable-512.png', 512, 0.56);
await icon('apple-touch-icon.png', 180, 0.66); // iOS kendi köşe yuvarlamasını uygular
