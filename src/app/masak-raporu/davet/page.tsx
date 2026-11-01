import { moduleAvailable } from '@/masak-raporu/server/config';
import { invitationInfo } from '@/masak-raporu/server/auth';
import { ROLE_LABELS } from '@/masak-raporu/permissions';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Unavailable } from '@/masak-raporu/ui/unavailable';
import { acceptInviteAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Davet' };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (!moduleAvailable().ok) return <Unavailable />;
  const { t = '' } = await searchParams;
  const info = /^[A-Za-z0-9_-]{30,80}$/.test(t) ? await invitationInfo(t) : null;
  return (
    <main className="mr-root flex min-h-screen items-center justify-center px-4 py-10">
      <div className="mr-card w-full max-w-[460px] p-6">
        <h1 className="text-[20px] font-bold">ALVERA MASAK RAPORU — Davet</h1>
        {!info ? (
          <p className="mt-3 text-[14px] text-[#8c1f24]">Davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş. İşletme yöneticinizden yeni davet isteyin.</p>
        ) : (
          <>
            <p className="mt-2 text-[14px] text-[#5f4d40]">
              <strong>{info.organization_name}</strong> işletmesine <strong>{ROLE_LABELS[info.role]}</strong> rolüyle davet edildiniz ({info.email}).
            </p>
            <ActionForm action={acceptInviteAction} className="mt-4 space-y-3">
              <input type="hidden" name="token" value={t} />
              <div><label className="mr-label" htmlFor="full_name">Ad soyad</label><input className="mr-input" id="full_name" name="full_name" required autoComplete="name" /></div>
              <div><label className="mr-label" htmlFor="password">Parola</label><input className="mr-input" id="password" name="password" type="password" required autoComplete="new-password" aria-describedby="pw-hint" /><p id="pw-hint" className="mr-hint mt-1">En az 12 karakter; büyük harf, küçük harf ve rakam içermeli.</p></div>
              <div><label className="mr-label" htmlFor="password2">Parola (tekrar)</label><input className="mr-input" id="password2" name="password2" type="password" required autoComplete="new-password" /></div>
              <Submit>Hesabı oluştur</Submit>
            </ActionForm>
          </>
        )}
      </div>
    </main>
  );
}
