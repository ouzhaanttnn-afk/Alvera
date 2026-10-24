import Link from 'next/link';
export function Brand() {
  return (
    <Link className="brand alvera-brand" href="/" aria-label="Alvera Kuyumculuk başvuru ana sayfa">
      <img src="/assets/alvera-wordmark.svg" alt="Alvera Kuyumculuk" width={907} height={317} />
      <small>MASAK FORM · MÜŞTERİ BİLGİLERİ</small>
    </Link>
  );
}
