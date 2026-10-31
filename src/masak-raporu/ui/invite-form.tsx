'use client';
import { useActionState } from 'react';
import { inviteAction } from '@/app/masak-raporu/actions';
import { ROLE_LABELS, ROLES } from '../permissions';
import { Submit, type FormState } from './form';

export function InviteForm({ canOwner }: { canOwner: boolean }) {
  const [state, run] = useActionState(inviteAction, {} as FormState);
  return (
    <form action={run} className="space-y-2">
      {state.error && <p role="alert" className="text-[13px] text-[#8c1f24]">{state.error}</p>}
      {state.ok && typeof state.data === 'string' && (
        <div role="status" className="rounded border border-[#b9d8bf] bg-[#eef7f0] p-2 text-[12.5px]">
          <p>{state.message}</p>
          <input readOnly value={state.data} className="mr-input mt-1 font-mono text-[11px]" aria-label="Davet bağlantısı" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <div><label className="mr-label" htmlFor="inv-email">E-posta</label><input className="mr-input" id="inv-email" name="email" type="email" required /></div>
      <div><label className="mr-label" htmlFor="inv-role">Rol</label><select className="mr-input" id="inv-role" name="role" defaultValue="staff">{ROLES.filter((r) => r !== 'owner' || canOwner).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
      <Submit>Davet bağlantısı oluştur</Submit>
    </form>
  );
}
