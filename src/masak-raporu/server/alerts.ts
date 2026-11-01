import 'server-only';
import { z } from 'zod';
import { audit } from './audit';
import { AppError } from './errors';
import type { Ctx } from './session';

export const ALERT_STATUS = { open: 'Açık', acknowledged: 'Görüldü', resolved: 'Çözüldü', dismissed: 'Uygun bulunmadı' } as const;

export async function listAlerts(ctx: Ctx, f: { status?: string; level?: string; rule?: string }) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select a.id, a.level, a.title, a.rationale, a.status, a.rule_key, a.rule_version, a.source_url, a.source_article, a.created_at, a.confidential,
              t.id as transaction_id, t.number as transaction_number, c.id as customer_id, c.display_name as customer_name
         from masak.compliance_alerts a left join masak.transactions t on t.id = a.transaction_id left join masak.customers c on c.id = a.customer_id
        where a.organization_id = $1 and ($2 = '' or a.status = $2) and ($3 = '' or a.level = $3) and ($4 = '' or a.rule_key = $4)
        order by (a.status = 'open') desc, case a.level when 'high' then 1 when 'review' then 2 else 3 end, a.created_at desc limit 200`,
      [ctx.org.organizationId, f.status ?? 'open', f.level || '', f.rule || ''],
    ),
  );
}

export const reviewSchema = z.object({
  decision: z.enum(['acknowledged', 'resolved', 'dismissed', 'reopened', 'note']),
  note: z.string().trim().min(5, 'Değerlendirme notu en az 5 karakter olmalı.').max(2000),
});

/** Nihai değerlendirme insana aittir; her karar gerekçesiyle ve zaman damgasıyla saklanır. */
export async function reviewAlert(ctx: Ctx, id: string, input: unknown) {
  ctx.need('alerts.review');
  const v = reviewSchema.parse(input);
  return ctx.db(async (sql) => {
    const status = v.decision === 'note' ? null : v.decision === 'reopened' ? 'open' : v.decision;
    const r = await sql.query<{ id: string; confidential: boolean }>(
      `update masak.compliance_alerts set status = coalesce($3, status), updated_at = now() where id = $1 and organization_id = $2 returning id, confidential`,
      [id, ctx.org.organizationId, status],
    );
    if (!r[0]) throw new AppError('NOT_FOUND', 'Uyarı bulunamadı.', 404);
    await sql.query(`insert into masak.alert_reviews (organization_id, alert_id, decision, note, actor_id) values ($1, $2, $3, $4, masak.uid())`, [ctx.org.organizationId, id, v.decision, v.note]);
    await audit(sql, ctx.org.organizationId, 'alert.reviewed', 'compliance_alerts', id, { decision: v.decision }, r[0].confidential);
  });
}
