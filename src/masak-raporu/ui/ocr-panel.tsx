'use client';
import { useState } from 'react';
import { parseTd1, tcknCandidates, type MrzResult } from '../mrz';

// Tesseract.js OCR yalnızca tarayıcıda çalışır: görüntü sunucuya veya üçüncü tarafa gönderilmez.
// Yalnızca OCR motoru ve dil verisi CDN'den indirilir. Sonuç kimlik doğrulaması DEĞİLDİR.
export function OcrPanel() {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [mrz, setMrz] = useState<MrzResult | null>(null);
  const [tckn, setTckn] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState('');

  async function run(file: File) {
    setError('');
    setMrz(null);
    setTckn([]);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('JPEG, PNG veya WEBP görüntü seçin (en fazla 10 MB).');
      return;
    }
    setStatus('OCR motoru yükleniyor…');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(['tur', 'eng'], 1, {
        logger: (m: { status: string; progress: number }) => {
          setStatus(m.status === 'recognizing text' ? 'Metin okunuyor…' : 'Hazırlanıyor…');
          setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setRaw(data.text);
      setMrz(parseTd1(data.text));
      setTckn(tcknCandidates(data.text));
      setStatus('Okuma tamamlandı. Bilgileri belge aslıyla karşılaştırın.');
    } catch {
      setError('OCR çalıştırılamadı (bağlantı veya tarayıcı desteği). Bilgileri elle girebilirsiniz.');
      setStatus('');
    }
  }

  return (
    <div className="rounded-lg border border-[#e5dacd] bg-[#fbf7f1] p-3">
      <p className="text-[13px] font-semibold">Belgeden okuma (isteğe bağlı OCR)</p>
      <p className="mr-hint mt-0.5">Kimlik kartının arka yüzünü (MRZ alanı) çekin veya seçin. Görüntü saklanmaz ve sunucuya gönderilmez.</p>
      <label htmlFor="ocr-file" className="mr-label mt-2">Görüntü</label>
      <input id="ocr-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="block text-[13px]" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      {status && (
        <p role="status" className="mt-2 text-[13px]">
          {status} {progress > 0 && progress < 100 && <span>%{progress}</span>}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-[#8c1f24]">{error}</p>}
      {raw && !mrz && tckn.length === 0 && <p className="mt-2 text-[13px]">Belgede MRZ alanı veya geçerli kimlik numarası okunamadı. Daha net, düz ve parlamasız bir fotoğraf deneyin ya da bilgileri elle girin.</p>}
      {raw && (
        <details className="mt-2 text-[12px]">
          <summary className="font-semibold text-[#794c2b]">Okunan ham metin</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-white p-2 font-mono" data-testid="ocr-raw">{raw}</pre>
        </details>
      )}
      {(mrz || tckn.length > 0) && (
        <div className="mt-2 rounded border border-[#ecd29a] bg-white p-2 text-[13px]">
          <p className="font-semibold text-[#7a4f00]">OCR önerisi — doğrulanmamış</p>
          {mrz && (
            <ul className="mt-1 space-y-0.5">
              <li>Soyad / ad: {mrz.surname} {mrz.givenNames}</li>
              <li>Belge no: {mrz.documentNumber} {mrz.checks.documentNumber ? '✓' : '(kontrol hanesi tutmadı)'}</li>
              <li>Doğum tarihi: {mrz.birthDate || '—'} {mrz.checks.birthDate ? '✓' : '(kontrol hanesi tutmadı)'}</li>
              <li>Son geçerlilik: {mrz.expiryDate || '—'}</li>
              <li>Uyruk: {mrz.nationality}</li>
              {mrz.personalNumber && <li>Kişisel no: {mrz.personalNumber} {mrz.checks.tckn ? '(TCKN sağlaması geçerli)' : ''}</li>}
            </ul>
          )}
          {!mrz && tckn.length > 0 && <p>Sağlaması geçen numara adayları: {tckn.join(', ')}</p>}
          <p className="mr-hint mt-1">Sağlama/kontrol hanesi doğruluğu kimliğin gerçek olduğunu göstermez. Bu değerleri belge aslıyla karşılaştırın; gerekirse müşteri kaydını düzeltin.</p>
        </div>
      )}
    </div>
  );
}
