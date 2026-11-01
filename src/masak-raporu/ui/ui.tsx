import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatKurus } from '../money';
import { LEVEL_LABELS, type Level } from '../rules/engine';

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-[12px] font-semibold text-[#794c2b] hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[22px] font-bold leading-tight text-[#2f241d]">{title}</h1>
        {description && <p className="mt-1 max-w-[75ch] text-[13px] text-[#5f4d40]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`mr-card p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-bold text-[#2f241d]">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const LEVEL_STYLE: Record<Level, string> = {
  info: 'bg-[#eef3f8] text-[#27486b] border-[#c9d8e8]',
  review: 'bg-[#fff4dc] text-[#7a4f00] border-[#ecd29a]',
  high: 'bg-[#fbeaea] text-[#8c1f24] border-[#e8b7b9]',
};
const LEVEL_ICON: Record<Level, string> = { info: 'ℹ', review: '!', high: '▲' };
export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={`mr-badge ${LEVEL_STYLE[level]}`}>
      <span aria-hidden="true">{LEVEL_ICON[level]}</span>
      {LEVEL_LABELS[level]}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'demo' }) {
  const s = {
    neutral: 'bg-[#f3ede6] text-[#5f4d40] border-[#e5dacd]',
    ok: 'bg-[#eaf5ec] text-[#245a2f] border-[#bfdcc5]',
    warn: 'bg-[#fff4dc] text-[#7a4f00] border-[#ecd29a]',
    danger: 'bg-[#fbeaea] text-[#8c1f24] border-[#e8b7b9]',
    demo: 'bg-[#efe9fb] text-[#4b3696] border-[#d6ccf2]',
  }[tone];
  return <span className={`mr-badge ${s}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#d9cbbb] bg-[#fcfaf7] px-4 py-8 text-center">
      <p className="font-semibold text-[#2f241d]">{title}</p>
      {children && <div className="mt-1 text-[13px] text-[#5f4d40]">{children}</div>}
    </div>
  );
}

export function Kv({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#7a6757]">{k}</dt>
          <dd className="break-words text-[14px] text-[#2f241d]">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({ label, name, hint, children, required }: { label: string; name: string; hint?: string; children?: ReactNode; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="mr-label">
        {label}
        {required && <span aria-hidden="true" className="text-[#a3262b]"> *</span>}
      </label>
      {children}
      {hint && <p className="mr-hint mt-1" id={`${name}-hint`}>{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  return <input id={props.id || props.name} className="mr-input" {...props} />;
}
export function Select({ options, placeholder, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; options: Record<string, string> | [string, string][]; placeholder?: string }) {
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <select id={props.id || props.name} className="mr-input" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {entries.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string }) {
  return <textarea id={props.id || props.name} className="mr-input" {...props} />;
}
export function Check({ name, label, defaultChecked, hint }: { name: string; label: ReactNode; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-[13px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[#794c2b]" />
      <span>
        {label}
        {hint && <span className="mr-hint block">{hint}</span>}
      </span>
    </label>
  );
}

export function Money({ kurus, currency }: { kurus: unknown; currency?: string }) {
  return <span className="mr-num">{formatKurus(String(kurus ?? '0'), currency)}</span>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) {
  const s = { info: 'border-[#d9cbbb] bg-[#fbf7f1] text-[#5f4d40]', warn: 'border-[#ecd29a] bg-[#fff8e8] text-[#6b4700]', danger: 'border-[#e8b7b9] bg-[#fbeeee] text-[#8c1f24]' }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-[13px] ${s}`}>{children}</div>;
}

export function NotOfficial() {
  return (
    <Notice>
      <strong>Önemli:</strong> ALVERA MASAK RAPORU bir iç kayıt ve denetim hazırlık aracıdır; MASAK Online&apos;ın yerine geçmez ve resmi bildirim yapmaz.
      Şüpheli işlem bildirimi yalnızca yetkili kişi tarafından resmi kanaldan (MASAK Online) yapılır.
    </Notice>
  );
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes('?') ? '&' : '?';
  return (
    <nav aria-label="Sayfalama" className="mt-3 flex justify-end gap-2">
      {page > 1 && <Link className="mr-btn" href={`${base}${sep}sayfa=${page - 1}`}>← Önceki</Link>}
      {hasMore && <Link className="mr-btn" href={`${base}${sep}sayfa=${page + 1}`}>Sonraki →</Link>}
    </nav>
  );
}

export function queryString(params: Record<string, string | undefined>) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
}
