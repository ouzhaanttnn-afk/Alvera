import { redirect } from 'next/navigation';
import { moduleAvailable, raporConfig } from '@/masak-raporu/server/config';
import { ensureLocalDemo } from '@/masak-raporu/server/seed';
import { currentUser } from '@/masak-raporu/server/session';
import { Unavailable } from '@/masak-raporu/ui/unavailable';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Giriş' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ davet?: string }> }) {
  if (!moduleAvailable().ok) return <Unavailable />;
  await ensureLocalDemo();
  if (await currentUser()) redirect('/masak-raporu');
  const local = raporConfig().local;
  const { davet } = await searchParams;
  return (
    <main className="mr-root flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 text-center">
          <img src="/assets/alvera-wordmark.svg" alt="Alvera Kuyumculuk" width={170} height={60} className="mx-auto h-auto w-[170px]" />
          <h1 className="mt-3 text-[20px] font-bold tracking-wide">ALVERA MASAK RAPORU</h1>
          <p className="text-[13px] text-[#5f4d40]">Yetkili personel girişi · İki adımlı doğrulama zorunludur</p>
        </div>
        {davet && <p role="status" className="mb-3 rounded-lg border border-[#b9d8bf] bg-[#eef7f0] px-3 py-2 text-[13px] text-[#245a2f]">Hesabınız oluşturuldu. Giriş yaptıktan sonra doğrulayıcı uygulamanızı eşleştireceksiniz.</p>}
        <div className="mr-card p-5">
          <LoginForm />
        </div>
        {local && (
          <p className="mt-3 rounded-lg border border-[#d6ccf2] bg-[#f4f0fd] px-3 py-2 text-[12px] text-[#4b3696]">
            Yerel demo ortamı: giriş bilgileri sunucudaki <code>.local/masak-raporu-demo-giris.txt</code> dosyasındadır. Yalnızca sentetik veri kullanın.
          </p>
        )}
        <p className="mt-4 text-center text-[12px] text-[#5f4d40]">
          Hesabınız yoksa işletme yöneticinizden davet isteyin. Açık kayıt yoktur.
        </p>
      </div>
    </main>
  );
}
