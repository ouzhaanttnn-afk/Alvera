import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
beforeAll(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  await pg.exec(readFileSync('supabase/migrations/202610210001_initial.sql', 'utf8'));
  await pg.exec(readFileSync('supabase/migrations/20261023084031_residence_document.sql', 'utf8'));
});
afterAll(async () => {
  await pg.close();
});
it('Migration tüm tablolar, RLS ve private bucket oluşturur', async () => {
  const { rows } = await pg.query<{ tablename: string; rowsecurity: boolean }>(
    "select tablename,rowsecurity from pg_tables where schemaname='public'",
  );
  expect(rows).toHaveLength(9);
  expect(rows.every((r) => r.rowsecurity)).toBe(true);
  expect(
    (
      await pg.query<{ public: boolean }>(
        "select public from storage.buckets where id='application-private'",
      )
    ).rows[0].public,
  ).toBe(false);
});
it('Anon/authenticated tablo ve RPC erişimi reddedilir', async () => {
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`set role ${role}`);
    await expect(pg.query('select * from applications')).rejects.toThrow();
    await expect(pg.query('select public.claim_notifications()')).rejects.toThrow();
    await pg.exec('reset role');
  }
});
it('İkamet türü yalnız PDF kabul eder', async () => {
  const intake = randomUUID();
  const doc = {
    id: randomUUID(),
    intake_id: intake,
    kind: 'residence',
    path: `${intake}/${randomUUID()}.pdf`,
    mime: 'application/pdf',
    size: 120,
  };
  await pg.query('select register_document($1::jsonb)', [JSON.stringify(doc)]);
  await expect(
    pg.query('select register_document($1::jsonb)', [
      JSON.stringify({
        ...doc,
        id: randomUUID(),
        path: `${intake}/${randomUUID()}.png`,
        mime: 'image/png',
      }),
    ]),
  ).rejects.toThrow();
});
it('PostgreSQL transaction idempotency, outbox, yetkisiz belge ve durum akışı', async () => {
  const intake = randomUUID(),
    id = randomUUID();
  const v = {
    id,
    intake,
    payload: 'encrypted-value',
    kind: 'individual',
    masked: '*******0146',
    notice: 'test',
    documents: [],
    receipt: true,
  };
  const a = (
    await pg.query<{ a: { reference: string } }>('select submit_application($1::jsonb) a', [
      JSON.stringify(v),
    ])
  ).rows[0].a;
  expect(a.reference).toMatch(/^NF-\d{4}-\d{6,}$/);
  const b = (
    await pg.query<{ a: { reference: string } }>('select submit_application($1::jsonb) a', [
      JSON.stringify({ ...v, id: randomUUID() }),
    ])
  ).rows[0].a;
  expect(b.reference).toBe(a.reference);
  expect(
    (await pg.query('select * from notification_outbox where application_id=$1', [id])).rows,
  ).toHaveLength(2);
  await expect(
    pg.query('select submit_application($1::jsonb)', [
      JSON.stringify({ ...v, id: randomUUID(), intake: randomUUID(), documents: [randomUUID()] }),
    ]),
  ).rejects.toThrow();
  await expect(
    pg.query("select admin_action($1,'admin','STATUS_CHANGED','APPROVED',null)", [id]),
  ).rejects.toThrow();
  await pg.query("select admin_action($1,'admin','STATUS_CHANGED','IN_REVIEW',null)", [id]);
  expect(
    (await pg.query<{ status: string }>('select status from applications where id=$1', [id]))
      .rows[0].status,
  ).toBe('IN_REVIEW');
  const claimed = (
    await pg.query<{ id: string; lease_until: string }>('select * from claim_notifications()')
  ).rows;
  expect(claimed).toHaveLength(2);
  expect((await pg.query('select * from claim_notifications()')).rows).toHaveLength(0);
  await pg.query('select finish_notification($1,$2,false)', [
    claimed[0].id,
    claimed[0].lease_until,
  ]);
  expect(
    (
      await pg.query<{ state: string }>('select state from notification_outbox where id=$1', [
        claimed[0].id,
      ])
    ).rows[0].state,
  ).toBe('failed');
});
