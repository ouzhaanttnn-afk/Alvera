'use client';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export type FormState = { ok?: boolean; error?: string; message?: string; fields?: Record<string, string>; data?: unknown };
export type FormAction = (state: FormState, data: FormData) => Promise<FormState>;

export function ActionForm({ action, children, className, successMessage, id }: { action: FormAction; children: ReactNode; className?: string; successMessage?: string; id?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className} id={id} noValidate>
      {state.error && (
        <div role="alert" className="mb-3 rounded-lg border border-[#e3b9ba] bg-[#fbeeee] px-3 py-2 text-[13px] text-[#8c1f24]">
          {state.error}
          {state.fields && Object.keys(state.fields).length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(state.fields).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.ok && (state.message || successMessage) && (
        <div role="status" className="mb-3 rounded-lg border border-[#b9d8bf] bg-[#eef7f0] px-3 py-2 text-[13px] text-[#245a2f]">
          {state.message || successMessage}
        </div>
      )}
      {children}
    </form>
  );
}

export function Submit({ children, variant = 'primary', name, value }: { children: ReactNode; variant?: 'primary' | 'default' | 'danger'; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={`mr-btn ${variant === 'primary' ? 'mr-btn-primary' : variant === 'danger' ? 'mr-btn-danger' : ''}`}>
      {pending ? 'İşleniyor…' : children}
    </button>
  );
}
