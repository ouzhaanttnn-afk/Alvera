'use client';
import { useActionState } from 'react';
import { loginMfaAction, loginPasswordAction } from '../actions';
import { Submit, type FormState } from '@/masak-raporu/ui/form';

type Step = { step: 'mfa' } | { step: 'enroll'; secret: string; uri: string; qr?: string };

export function LoginForm() {
  const [pw, pwAction] = useActionState(loginPasswordAction, {} as FormState);
  const [mfa, mfaAction] = useActionState(loginMfaAction, {} as FormState);
  const step = pw.ok ? (pw.data as Step) : null;
  if (!step)
    return (
      <form action={pwAction} className="space-y-3">
        {pw.error && <p role="alert" className="rounded-lg border border-[#e3b9ba] bg-[#fbeeee] px-3 py-2 text-[13px] text-[#8c1f24]">{pw.error}</p>}
        <div>
          <label className="mr-label" htmlFor="email">E-posta</label>
          <input className="mr-input" id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label className="mr-label" htmlFor="password">Parola</label>
          <input className="mr-input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Submit>Devam et</Submit>
      </form>
    );
  return (
    <form action={mfaAction} className="space-y-3">
      {step.step === 'enroll' && (
        <div className="rounded-lg border border-[#e5dacd] bg-[#fbf7f1] p-3 text-[13px]">
          <p className="font-semibold">İki adımlı doğrulamayı kurun</p>
          <p className="mt-1 text-[#5f4d40]">Google Authenticator, Microsoft Authenticator veya benzeri bir uygulamaya aşağıdaki anahtarı ekleyin, ardından üretilen 6 haneli kodu girin.</p>
          {step.qr && <img src={step.qr} alt="Doğrulayıcı uygulama için QR kodu" className="mx-auto my-2 h-40 w-40 bg-white" />}
          <p className="mt-2 break-all rounded bg-white px-2 py-1 font-mono text-[13px]" aria-label="Gizli anahtar">{step.secret}</p>
          <a href={step.uri} className="mt-1 inline-block text-[12px] font-semibold text-[#794c2b] underline">Bu cihazdaki doğrulayıcıda aç</a>
        </div>
      )}
      {mfa.error && <p role="alert" className="rounded-lg border border-[#e3b9ba] bg-[#fbeeee] px-3 py-2 text-[13px] text-[#8c1f24]">{mfa.error}</p>}
      <div>
        <label className="mr-label" htmlFor="code">Doğrulama kodu</label>
        <input className="mr-input text-center font-mono text-[18px] tracking-[.3em]" id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus />
      </div>
      <Submit>Giriş yap</Submit>
    </form>
  );
}
