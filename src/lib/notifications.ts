import { config } from './config';
import { decrypt } from './crypto';
import { store } from './db';
import { safeLog } from './security';
import { statusLabels, type ApplicationData, type Application, type Outbox } from './types';
export function notificationContent(a: Application, audience: Outbox['audience']) {
  const c = config();
  return {
    subject:
      audience === 'admin' ? `Yeni Başvuru — ${a.reference}` : `Başvurunuz alındı — ${a.reference}`,
    text: [
      `Başvuru numarası: ${a.reference}`,
      `Tarih: ${new Date(a.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
      `Başvuru türü: ${a.kind === 'individual' ? 'Bireysel' : 'Kurumsal'}`,
      `Durum: ${statusLabels[a.status]}`,
      audience === 'admin'
        ? `Yönetim paneli: ${c.url}/masak-form/admin?application=${a.id}`
        : 'Başvurunuz değerlendirilmek üzere kaydedildi.',
    ].join('\n'),
  };
}
export async function deliver(item: Outbox, a: Application) {
  if (config().local) throw new Error('LOCAL_DELIVERY_DISABLED');
  const recipient =
    item.audience === 'admin' ? process.env.ADMIN_EMAIL : decrypt<ApplicationData>(a.payload).email;
  if (!recipient) throw new Error('MISSING_RECIPIENT');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `nf/${item.id}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [recipient],
      ...notificationContent(a, item.audience),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('DELIVERY_FAILED');
}
export async function processOutbox(sender = deliver) {
  const db = await store();
  const rows = await db.claim();
  let sent = 0,
    failed = 0;
  for (const row of rows) {
    try {
      const a = await db.get(row.application_id);
      if (!a) throw new Error('NOT_FOUND');
      await sender(row, a);
      await db.finish(row.id, row.lease_until!, true);
      sent++;
    } catch {
      await db.finish(row.id, row.lease_until!, false);
      safeLog('NOTIFICATION_FAILED');
      failed++;
    }
  }
  return { sent, failed };
}
