import 'server-only';
import type { Ctx } from './session';

export async function dashboard(ctx: Ctx, from: string, to: string) {
  ctx.need('records.read');
  const org = ctx.org.organizationId;
  return ctx.db(async (sql) => {
    const range = [org, from, to];
    const inRange = `t.organization_id = $1 and t.occurred_at >= ($2 || 'T00:00:00+03:00')::timestamptz and t.occurred_at < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day')`;
    const [summary, today, identity, missing, alerts, days, activity, cases, pendingLinks, demo] = await Promise.all([
      sql.query<{ count: number; total: string; purchases: string; sales: string }>(
        `select count(*)::int as count, coalesce(sum(total_try_kurus), 0)::text as total,
                coalesce(sum(total_try_kurus) filter (where type in ('gold_purchase','scrap_gold_purchase')), 0)::text as purchases,
                coalesce(sum(total_try_kurus) filter (where type in ('gold_sale','jewelry_sale','bullion')), 0)::text as sales
           from masak.transactions t where ${inRange} and t.status = 'completed'`, range),
      sql.query<{ count: number }>(
        `select count(*)::int as count from masak.transactions t where t.organization_id = $1 and t.status = 'completed'
           and (t.occurred_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date`, [org]),
      sql.query<{ required: number; unverified: number }>(
        `select count(distinct a.transaction_id)::int as required,
                count(distinct a.transaction_id) filter (where not exists (select 1 from masak.customer_identity_checks k where k.customer_id = t.customer_id and k.status = 'verified'))::int as unverified
           from masak.compliance_alerts a join masak.transactions t on t.id = a.transaction_id
          where ${inRange} and t.status = 'completed' and a.rule_key in ('KT-ESIK','KT-BAGLANTILI','KT-SUREKLI','KT-DOGRULUK','KT-SUPHE')`, range),
      sql.query<{ count: number }>(`select count(*)::int as count from masak.compliance_alerts a where a.organization_id = $1 and a.status = 'open' and a.rule_key = 'VERI-EKSIK'`, [org]),
      sql.query<{ level: string; count: number }>(`select level, count(*)::int as count from masak.compliance_alerts where organization_id = $1 and status = 'open' group by level`, [org]),
      sql.query<{ day: string; count: number; total: string }>(
        `select to_char(d, 'YYYY-MM-DD') as day, count(t.id)::int as count, coalesce(sum(t.total_try_kurus), 0)::text as total
           from generate_series($2::date, $3::date, interval '1 day') d
           left join masak.transactions t on t.organization_id = $1 and t.status = 'completed' and (t.occurred_at at time zone 'Europe/Istanbul')::date = d::date
          group by d order by d`, range),
      ctx.can('audit.view')
        ? sql.query<Record<string, unknown>>(
            `select e.action, e.created_at, e.entity_type, e.entity_id, p.full_name from masak.audit_events e left join masak.profiles p on p.id = e.actor_id
              where e.organization_id = $1 order by e.id desc limit 10`, [org])
        : sql.query<Record<string, unknown>>(
            `select 'transaction.created' as action, t.created_at, 'transactions' as entity_type, t.id as entity_id, p.full_name from masak.transactions t
               left join masak.profiles p on p.id = t.created_by where t.organization_id = $1 order by t.created_at desc limit 10`, [org]),
      ctx.can('cases.view')
        ? sql.query<{ open: number; due_soon: number }>(
            `select count(*) filter (where status <> 'closed' and status <> 'reported_externally')::int as open,
                    count(*) filter (where status in ('submitted','investigating','info_needed','report_considered') and due_at < now() + interval '3 days')::int as due_soon
               from masak.risk_cases where organization_id = $1`, [org])
        : Promise.resolve([{ open: 0, due_soon: 0 }]),
      sql.query<{ count: number }>(`select count(*)::int as count from masak.transaction_link_groups where organization_id = $1 and status = 'proposed'`, [org]),
      sql.query<{ count: number }>(`select count(*)::int as count from masak.transactions where organization_id = $1 and is_demo`, [org]),
    ]);
    const byLevel = Object.fromEntries(alerts.map((a) => [a.level, a.count]));
    return {
      summary: summary[0], today: today[0].count, identity: identity[0], missing: missing[0].count,
      alerts: { high: byLevel.high || 0, review: byLevel.review || 0, info: byLevel.info || 0 },
      days, activity, cases: cases[0], pendingLinks: pendingLinks[0].count, demoCount: demo[0].count,
    };
  });
}

export async function notifications(ctx: Ctx) {
  const org = ctx.org.organizationId;
  return ctx.db(async (sql) => {
    const [high, due, links] = await Promise.all([
      sql.query<{ n: number }>(`select count(*)::int as n from masak.compliance_alerts where organization_id = $1 and status = 'open' and level = 'high'`, [org]),
      ctx.can('cases.view')
        ? sql.query<{ n: number }>(`select count(*)::int as n from masak.risk_cases where organization_id = $1 and status in ('submitted','investigating','info_needed','report_considered') and due_at < now() + interval '3 days'`, [org])
        : Promise.resolve([{ n: 0 }]),
      ctx.can('links.decide') ? sql.query<{ n: number }>(`select count(*)::int as n from masak.transaction_link_groups where organization_id = $1 and status = 'proposed'`, [org]) : Promise.resolve([{ n: 0 }]),
    ]);
    return { high: high[0].n, dueCases: due[0].n, pendingLinks: links[0].n };
  });
}

export async function quickSearch(ctx: Ctx, q: string, hash: string | null) {
  ctx.need('records.read');
  const term = q.trim();
  if (term.length < 2) return { customers: [], transactions: [] };
  return ctx.db(async (sql) => ({
    customers: await sql.query<{ id: string; display_name: string; identity_masked: string | null }>(
      `select id, display_name, identity_masked from masak.customers where organization_id = $1 and (display_name ilike '%' || $2 || '%' or identity_hash = $3 or tax_hash = $3) order by display_name limit 20`,
      [ctx.org.organizationId, term, hash]),
    transactions: await sql.query<{ id: string; number: string; occurred_at: Date; total: string }>(
      `select id, number, occurred_at, total_try_kurus::text as total from masak.transactions where organization_id = $1 and (number ilike '%' || $2 || '%' or invoice_reference ilike '%' || $2 || '%') order by occurred_at desc limit 20`,
      [ctx.org.organizationId, term]),
  }));
}
