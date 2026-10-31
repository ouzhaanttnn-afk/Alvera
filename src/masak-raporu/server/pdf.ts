import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDateTime } from '../dates';

export const DISCLAIMER = 'İç kayıt/denetim hazırlık dokümanıdır, resmi MASAK bildirim belgesi değildir.';
export const CONFIDENTIAL_NOTE =
  'GİZLİ — Şüpheli işlem değerlendirmesi içerir. 5549 sayılı Kanun md. 4/2 ve Tedbirler Yönetmeliği md. 29 uyarınca işleme taraf olanlar dahil hiç kimseyle paylaşılamaz.';

export type Column = { key: string; label: string; width: number; align?: 'left' | 'right' };
export type Section = {
  heading: string;
  note?: string;
  kv?: [string, string][];
  table?: { columns: Column[]; rows: Record<string, string>[]; empty?: string };
  paragraphs?: string[];
};
export type ReportDoc = {
  title: string;
  reference: string;
  organizationName: string;
  preparedBy: string;
  generatedAt: Date;
  scope: [string, string][];
  confidential: boolean;
  sections: Section[];
};

const W = 595, H = 842, M = 40, CONTENT = W - 2 * M;
const INK = rgb(0.17, 0.13, 0.1), MUTED = rgb(0.38, 0.31, 0.26), BRONZE = rgb(0.47, 0.3, 0.17), LINE = rgb(0.85, 0.8, 0.74), RED = rgb(0.6, 0.1, 0.1);

const clean = (s: unknown) => String(s ?? '—').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\t/g, ' ');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    let row = '';
    for (const word of para.split(' ')) {
      const candidate = row ? `${row} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        row = candidate;
        continue;
      }
      if (row) out.push(row);
      row = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(row + ch, size) > width) {
          out.push(row);
          row = '';
        }
        row += ch;
      }
    }
    out.push(row);
  }
  return out;
}

export async function renderPdf(doc: ReportDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${doc.title} — ${doc.reference}`);
  pdf.setAuthor('ALVERA MASAK RAPORU');
  pdf.setSubject(DISCLAIMER);
  pdf.setProducer('ALVERA MASAK RAPORU');
  pdf.setCreationDate(doc.generatedAt);
  const font = await pdf.embedFont(await readFile(join(/* turbopackIgnore: true */ process.cwd(), 'assets/fonts/NotoSans-Regular.ttf')), { subset: true });
  const logo = await pdf.embedPng(await readFile(join(/* turbopackIgnore: true */ process.cwd(), 'public/brand/alvera.png')));
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    const size = logo.scaleToFit(105, 35);
    page.drawImage(logo, { x: M, y: H - M - size.height, width: size.width, height: size.height });
    const right = (t: string, yy: number, s: number, c = INK) => page.drawText(t, { x: W - M - font.widthOfTextAtSize(t, s), y: yy, size: s, font, color: c });
    right('ALVERA KUYUMCULUK', H - M - 12, 10, BRONZE);
    right(clean(doc.title).slice(0, 80), H - M - 25, 8, MUTED);
    if (doc.confidential) right('GİZLİ', H - M - 38, 8, RED);
    page.drawLine({ start: { x: M, y: H - M - 44 }, end: { x: W - M, y: H - M - 44 }, thickness: 0.6, color: LINE });
    y = H - M - 62;
  };
  const ensure = (h: number) => {
    if (y - h < M + 34) newPage();
  };
  const text = (t: string, size = 9, color = INK, x = M, width = CONTENT, gap = 3) => {
    for (const line of wrap(t, font, size, width)) {
      ensure(size + gap);
      page.drawText(line, { x, y: y - size, size, font, color });
      y -= size + gap;
    }
  };

  newPage();
  text(doc.title, 17, INK);
  y -= 4;
  text(`ALVERA MASAK RAPORU · ${doc.organizationName}`, 9, MUTED);
  y -= 6;
  const boxLines = wrap(DISCLAIMER, font, 9, CONTENT - 20);
  const boxH = boxLines.length * 12 + 12;
  page!.drawRectangle({ x: M, y: y - boxH, width: CONTENT, height: boxH, color: rgb(0.98, 0.95, 0.9), borderColor: BRONZE, borderWidth: 0.6 });
  boxLines.forEach((l, i) => page!.drawText(l, { x: M + 10, y: y - 16 - i * 12, size: 9, font, color: BRONZE }));
  y -= boxH + 8;
  if (doc.confidential) {
    const lines = wrap(CONFIDENTIAL_NOTE, font, 8.5, CONTENT - 20);
    const h = lines.length * 11 + 12;
    page!.drawRectangle({ x: M, y: y - h, width: CONTENT, height: h, color: rgb(0.99, 0.93, 0.93), borderColor: RED, borderWidth: 0.6 });
    lines.forEach((l, i) => page!.drawText(l, { x: M + 10, y: y - 15 - i * 11, size: 8.5, font, color: RED }));
    y -= h + 8;
  }
  const meta: [string, string][] = [
    ['Rapor referansı', doc.reference],
    ['Oluşturma zamanı', formatDateTime(doc.generatedAt)],
    ['Hazırlayan', doc.preparedBy],
    ...doc.scope,
  ];
  const kv = (pairs: [string, string][]) => {
    for (const [k, v] of pairs) {
      const lines = wrap(v, font, 9, CONTENT - 150);
      ensure(lines.length * 12 + 2);
      page.drawText(clean(k), { x: M, y: y - 9, size: 8.5, font, color: MUTED });
      lines.forEach((l, i) => page.drawText(l, { x: M + 150, y: y - 9 - i * 12, size: 9, font, color: INK }));
      y -= lines.length * 12 + 2;
    }
  };
  kv(meta);

  for (const s of doc.sections) {
    y -= 10;
    ensure(40);
    text(s.heading, 12, BRONZE);
    page!.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.4, color: LINE });
    y -= 5;
    if (s.note) text(s.note, 8, MUTED);
    if (s.kv) kv(s.kv);
    for (const p of s.paragraphs || []) text(p, 9);
    if (s.table) {
      const cols = s.table.columns;
      const total = cols.reduce((a, c) => a + c.width, 0);
      const widths = cols.map((c) => (c.width / total) * CONTENT);
      const header = () => {
        ensure(18);
        page.drawRectangle({ x: M, y: y - 14, width: CONTENT, height: 14, color: rgb(0.95, 0.92, 0.88) });
        let x = M;
        cols.forEach((c, i) => {
          page.drawText(wrap(c.label, font, 7.5, widths[i] - 6)[0], { x: x + 3, y: y - 10, size: 7.5, font, color: MUTED });
          x += widths[i];
        });
        y -= 16;
      };
      header();
      if (!s.table.rows.length) text(s.table.empty || 'Kayıt bulunamadı.', 8.5, MUTED);
      for (const row of s.table.rows) {
        const cells = cols.map((c, i) => wrap(row[c.key] ?? '—', font, 7.5, widths[i] - 6));
        const h = Math.max(...cells.map((l) => l.length)) * 9.5 + 4;
        if (y - h < M + 34) {
          newPage();
          header();
        }
        let x = M;
        cells.forEach((lines, i) => {
          lines.forEach((l, j) => {
            const w = font.widthOfTextAtSize(l, 7.5);
            page.drawText(l, { x: cols[i].align === 'right' ? x + widths[i] - 3 - w : x + 3, y: y - 8 - j * 9.5, size: 7.5, font, color: INK });
          });
          x += widths[i];
        });
        y -= h;
        page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: LINE });
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: W - M, y: M + 18 }, thickness: 0.4, color: LINE });
    p.drawText(clean(DISCLAIMER), { x: M, y: M + 6, size: 7, font, color: MUTED });
    const label = `Ref: ${doc.reference} · Sayfa ${i + 1} / ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7), y: M - 6, size: 7, font, color: MUTED });
  });
  return pdf.save();
}
