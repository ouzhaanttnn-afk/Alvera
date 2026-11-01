'use client';
import { useState } from 'react';
import Link from 'next/link';
import { commitImportAction, previewImportAction } from '@/app/masak-raporu/actions';
import { parseCsv, type Mapping } from '../csv';
import { formatKurus } from '../money';
import type { ImportPreview } from '../server/imports';

const GUESS: Record<string, RegExp> = {
  occurred_at: /tarih|date/i, customer_identifier: /tckn|vkn|kimlik|vergi/i, type: /tür|tur|type|işlem türü/i, product_description: /ürün|urun|açıklama|product/i,
  karat: /ayar|karat/i, weight_grams: /gram|ağırlık/i, quantity: /adet|miktar|qty/i, unit_price: /birim/i, total: /toplam|tutar|total/i, currency: /para|döviz|currency/i,
  fx_rate: /kur$|^kur|rate/i, fx_source: /kaynak/i, payment_method: /ödeme|odeme|payment/i, invoice_reference: /fiş|fis|fatura|invoice/i,
};

export function ImportWizard({ fields }: { fields: Record<string, { label: string; required: boolean }> }) {
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ imported?: number; skipped?: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load(file: File) {
    setError(''); setPreview(null); setResult(null);
    if (file.size > 2 * 1024 * 1024) return setError('CSV dosyası en fazla 2 MB olabilir.');
    file.text().then((text) => {
      try {
        const table = parseCsv(text);
        const h = table[0] || [];
        setCsv(text);
        setHeaders(h);
        const m: Mapping = {};
        for (const [f, re] of Object.entries(GUESS)) {
          const i = h.findIndex((x) => re.test(x));
          if (i >= 0 && !Object.values(m).includes(i)) m[f as keyof Mapping] = i;
        }
        setMapping(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'CSV okunamadı.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="mr-card p-4">
        <h2 className="text-[15px] font-bold">1. Dosya</h2>
        <label htmlFor="csv-file" className="mr-label mt-2">CSV dosyası (; veya , ayraçlı, UTF-8)</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="text-[13px]" />
        {error && <p role="alert" className="mt-2 text-[13px] text-[#8c1f24]">{error}</p>}
      </section>
      {headers.length > 0 && (
        <section className="mr-card p-4">
          <h2 className="text-[15px] font-bold">2. Kolon eşleme</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(fields).map(([f, meta]) => (
              <div key={f}>
                <label className="mr-label" htmlFor={`map-${f}`}>{meta.label}{meta.required && <span aria-hidden className="text-[#a3262b]"> *</span>}</label>
                <select id={`map-${f}`} className="mr-input" value={mapping[f as keyof Mapping] ?? ''} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">— eşlenmedi —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Kolon ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button className="mr-btn mr-btn-primary mt-3" type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError(''); setResult(null);
            const r = await previewImportAction(csv, mapping);
            setBusy(false);
            if (r.error) setError(r.error); else setPreview(r.preview!);
          }}>{busy ? 'Doğrulanıyor…' : 'Önizle ve doğrula'}</button>
        </section>
      )}
      {preview && (
        <section className="mr-card p-4">
          <h2 className="text-[15px] font-bold">3. Önizleme</h2>
          <p className="mt-1 text-[13px]" role="status"><strong>{preview.valid.length}</strong> satır içe aktarılmaya hazır · <strong>{preview.errors.length}</strong> hata · <strong>{preview.duplicates.length}</strong> mükerrer</p>
          {preview.valid.length > 0 && (
            <div className="mt-2 max-h-[280px] overflow-auto"><table className="mr-table"><thead><tr><th scope="col">Satır</th><th scope="col">Tarih</th><th scope="col">Müşteri</th><th scope="col">Tür</th><th scope="col" className="mr-num">Tutar</th><th scope="col">Fiş</th></tr></thead>
              <tbody>{preview.valid.map((r) => <tr key={r.line}><td>{r.line}</td><td>{new Date(r.occurredAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td>{r.customer}</td><td>{r.type}</td><td className="mr-num">{formatKurus(r.total)}</td><td>{r.invoice || '—'}</td></tr>)}</tbody></table></div>
          )}
          {(preview.errors.length > 0 || preview.duplicates.length > 0) && (
            <details className="mt-3" open>
              <summary className="text-[13px] font-semibold text-[#8c1f24]">Hata raporu</summary>
              <table className="mr-table mt-2"><thead><tr><th scope="col">Satır</th><th scope="col">Alan</th><th scope="col">Sorun</th></tr></thead>
                <tbody>{[...preview.errors, ...preview.duplicates].sort((a, b) => a.line - b.line).map((e, i) => <tr key={i}><td>{e.line || 'Başlık'}</td><td>{fields[e.field]?.label || e.field}</td><td>{e.message}</td></tr>)}</tbody></table>
            </details>
          )}
          {preview.valid.length > 0 && !result && (
            <button className="mr-btn mr-btn-primary mt-3" type="button" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await commitImportAction(csv, mapping);
              setBusy(false);
              if (r.error) setError(r.error); else setResult(r);
            }}>{busy ? 'Kaydediliyor…' : `${preview.valid.length} satırı içe aktar`}</button>
          )}
          {result && <p role="status" className="mt-3 rounded-lg border border-[#b9d8bf] bg-[#eef7f0] px-3 py-2 text-[13px] text-[#245a2f]">{result.imported} işlem kaydedildi ve kural motorundan geçirildi; {result.skipped} satır atlandı. <Link className="underline" href="/masak-raporu/islemler">İşlemlere git</Link></p>}
        </section>
      )}
    </div>
  );
}
