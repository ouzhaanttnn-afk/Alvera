import type { ReactNode } from 'react';
import { Unavailable } from '@/masak-raporu/ui/unavailable';
import { moduleAvailable } from '@/masak-raporu/server/config';
import { requireCtx } from '@/masak-raporu/server/session';
import { Shell } from '@/masak-raporu/ui/shell';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  if (!moduleAvailable().ok) return <Unavailable />;
  const ctx = await requireCtx();
  return <Shell ctx={ctx}>{children}</Shell>;
}
