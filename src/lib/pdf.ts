import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Detail } from './types';
import { statusLabels } from './types';
import { getFile } from './storage';
export async function createApplicationPdf(d: Detail) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf')),
    { subset: true },
  );
  let page = pdf.addPage([595, 842]),
    y = 780;
  const line = (text: string, size = 10) => {
    if (y < 65) {
      page = pdf.addPage([595, 842]);
      y = 780;
    }
    page.drawText(text, { x: 48, y, size, font, color: rgb(0.12, 0.21, 0.25) });
    y -= size + 10;
  };
  const wrap = (text: string, size = 10) => {
    for (const paragraph of text.replace(/[\u0000-\u001f]/g, ' ').split('\n')) {
      let row = '';
      for (const word of paragraph.split(' ')) {
        const candidate = row ? `${row} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= 490) {
          row = candidate;
          continue;
        }
        if (row) line(row, size);
        row = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(row + char, size) > 490) {
            line(row, size);
            row = '';
          }
          row += char;
        }
      }
      if (row) line(row, size);
    }
  };
  const logo = await pdf.embedPng(await readFile(join(process.cwd(), 'public/brand/alvera.png')));
  const logoSize = logo.scaleToFit(145, 49);
  page.drawImage(logo, { x: 402, y: 755, width: logoSize.width, height: logoSize.height });
  line('ALVERA FORM', 21);
  line('Müşteri Başvuru Kaydı', 13);
  y -= 8;
  line(d.application.reference, 15);
  line(
    `Tarih: ${new Date(d.application.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
  );
  line(`Durum: ${statusLabels[d.application.status]}`);
  y -= 10;
  const fields: [string, string][] = [
    ['Başvuru türü', d.data.kind === 'individual' ? 'Bireysel' : 'Kurumsal'],
    ['Ad soyad / şirket', d.data.name],
    ['Kimlik / vergi no', d.application.masked_identity],
    ['Kimlik tipi', d.data.identityType],
    ['Telefon', d.data.phone],
    ['E-posta', d.data.email],
    ['İl / ilçe', `${d.data.province} / ${d.data.district}`],
    ['Mahalle', d.data.neighborhood],
    ['Adres', d.data.address],
    [
      'İkametgâh belgesi',
      d.documents.some((doc) => doc.kind === 'residence') ? 'PDF yüklendi' : 'Yüklenmedi',
    ],
    ['Uyruk', d.data.nationality],
    ['Meslek / unvan', d.data.occupation],
    ['Satış tutarı (TRY)', d.data.amount],
  ];
  for (const [label, value] of fields) wrap(`${label}: ${value || 'Belirtilmedi'}`);
  const signature = d.documents.find((v) => v.kind === 'signature');
  if (signature) {
    if (y < 220) {
      page = pdf.addPage([595, 842]);
      y = 780;
    }
    line('Çizim imzası', 12);
    const img = await pdf.embedPng(await getFile(signature.path));
    const size = img.scaleToFit(220, 90);
    page.drawImage(img, { x: 48, y: y - size.height, width: size.width, height: size.height });
    y -= size.height + 25;
  }
  y -= 8;
  wrap(
    'Bu belge başvuru sırasında beyan edilen bilgilerin kayıt özetidir. Kimlik doğrulaması veya hukuki uygunluk belgesi değildir. Çizilerek alınan imza, 5070 sayılı Kanun kapsamında güvenli elektronik imza olarak tanımlanmaz.',
    9,
  );
  wrap(`Aydınlatma metni sürümü: ${d.application.notice_version}`, 9);
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Alvera Form | ${d.application.reference} | ${i + 1}/${pages.length}`, {
      x: 48,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.45, 0.48),
    }),
  );
  pdf.setTitle(`Başvuru ${d.application.reference}`);
  return pdf.save();
}
