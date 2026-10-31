import Link from 'next/link';
import { requireCtx } from '@/masak-raporu/server/session';

export const metadata = { title: 'Yetki yok' };

export default async function Forbidden() {
  await requireCtx();
  return (
    <div className="mr-card mx-auto mt-10 max-w-[520px] p-6 text-center">
      <h1 className="text-[20px] font-bold">Bu sayfa için yetkiniz yok</h1>
      <p className="mt-2 text-[14px] text-[#5f4d40]">Rolünüz bu bilgiye erişim izni içermiyor. Gerekirse işletme sahibinden veya yöneticiden yetki isteyin.</p>
      <Link className="mr-btn mt-4" href="/masak-raporu">Gösterge paneline dön</Link>
    </div>
  );
}
