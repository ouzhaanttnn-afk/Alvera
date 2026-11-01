'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname() || '';
  const active = path === href || (href !== '/masak-raporu' && path.startsWith(`${href}/`) && !['/masak-raporu/islemler', '/masak-raporu/ayarlar'].includes(href));
  return (
    <Link href={href} aria-current={active || path === href ? 'page' : undefined} prefetch={false}>
      {children}
    </Link>
  );
}
