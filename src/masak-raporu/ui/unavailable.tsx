import Link from 'next/link';

export function Unavailable() {
  return (
    <main className="mr-root flex items-center justify-center px-4">
      <div className="mr-card max-w-[520px] p-6 text-center">
        <img src="/assets/alvera-wordmark.svg" alt="Alvera Kuyumculuk" width={160} height={57} className="mx-auto h-auto w-[160px]" />
        <h1 className="mt-4 text-[20px] font-bold">ALVERA MASAK RAPORU henüz açılmadı.</h1>
        <p className="mt-2 text-[14px] text-[#5f4d40]">Güvenlik, veritabanı ve hukuki inceleme yapılandırmaları tamamlanmadan panel erişime kapalıdır.</p>
        <Link className="mr-btn mt-4" href="/">Ana sayfaya dön</Link>
      </div>
    </main>
  );
}
