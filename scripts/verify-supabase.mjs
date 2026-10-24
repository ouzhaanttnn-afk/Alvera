import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { connection } from './supabase-connection.mjs';

const { env, sql } = connection();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const bucket = 'application-private';
const key = `synthetic-verification/${randomUUID()}.png`;
const checks = [];
try {
  const tables = await sql`select tablename, rowsecurity from pg_tables where schemaname='public'`;
  const names = [
    'applications',
    'application_documents',
    'application_signatures',
    'application_status_history',
    'admin_users',
    'audit_logs',
    'notification_outbox',
    'rate_limits',
    'reference_counters',
  ];
  assert(names.every((name) => tables.some((t) => t.tablename === name && t.rowsecurity)));
  for (const role of ['anon', 'authenticated']) {
    for (const table of names) {
      const [grants] =
        await sql`select has_table_privilege(${role},${`public.${table}`},'SELECT,INSERT,UPDATE,DELETE') as allowed`;
      assert.equal(grants.allowed, false);
    }
    const rpcs =
      await sql`select p.proname, has_function_privilege(${role},p.oid,'EXECUTE') as allowed
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('register_document','submit_application','admin_action','claim_notifications','finish_notification','take_rate_limit')`;
    assert.equal(rpcs.length, 6);
    assert(rpcs.every((p) => !p.allowed));
  }
  checks.push('Dokuz tabloda RLS; anon/authenticated tablo ve altı RPC erişimi kapalı');
  const { data: bucketData, error: bucketError } = await admin.storage.getBucket(bucket);
  assert.equal(bucketError, null);
  assert.equal(bucketData.public, false);
  checks.push('Yönetilen private Storage bucket doğrulandı');

  // Transaction rollback also restores reference counters: no application/outbox remains.
  try {
    await sql.begin(async (tx) => {
      const cipher = createCipheriv('aes-256-gcm', randomBytes(32), randomBytes(12));
      const payload = Buffer.concat([cipher.update('sentetik test'), cipher.final()]).toString(
        'base64',
      );
      const intake = randomUUID(),
        id = randomUUID(),
        document = randomUUID();
      await tx`select register_document(${tx.json({ id: document, intake_id: intake, kind: 'front', path: key, mime: 'image/png', size: 100 })}::jsonb)`;
      const residence = randomUUID();
      await tx`select register_document(${tx.json({ id: residence, intake_id: intake, kind: 'residence', path: `synthetic-verification/${residence}.pdf`, mime: 'application/pdf', size: 100 })}::jsonb)`;
      const v = {
        id,
        intake,
        payload,
        kind: 'individual',
        masked: '*******0146',
        notice: 'synthetic-test',
        documents: [document, residence],
        receipt: false,
      };
      const [first] = await tx`select submit_application(${tx.json(v)}::jsonb) as a`;
      assert.match(first.a.reference, /^NF-\d{4}-\d{6,}$/);
      const [repeat] =
        await tx`select submit_application(${tx.json({ ...v, id: randomUUID() })}::jsonb) as a`;
      assert.equal(first.a.id, repeat.a.id);
      const [count] =
        await tx`select count(*)::int as n from notification_outbox where application_id=${id}`;
      assert.equal(count.n, 1);
      const [doc] = await tx`select application_id from application_documents where id=${document}`;
      assert.equal(doc.application_id, id);
      const [residenceDoc] = await tx`select application_id,kind,mime from application_documents where id=${residence}`;
      assert.equal(residenceDoc.application_id, id);
      assert.equal(residenceDoc.kind, 'residence');
      assert.equal(residenceDoc.mime, 'application/pdf');
      await tx`select admin_action(${id},'synthetic-test','STATUS_CHANGED','IN_REVIEW',null)`;
      const [changed] = await tx`select status from applications where id=${id}`;
      assert.equal(changed.status, 'IN_REVIEW');
      const claimed =
        await tx`select c.*, c.lease_until::text as lease_text from claim_notifications() c`;
      const item = claimed.find((n) => n.application_id === id);
      assert(item);
      // Bind text before casting: JS Date serialization would truncate microseconds.
      await tx`select finish_notification(${item.id},${item.lease_text}::text::timestamptz,false)`;
      const [failed] =
        await tx`select state,attempts,last_error from notification_outbox where id=${item.id}`;
      assert.equal(failed.state, 'failed');
      assert.equal(failed.attempts, 1);
      assert.equal(failed.last_error, 'DELIVERY_FAILED');
      const [preserved] = await tx`select count(*)::int as n from applications where id=${id}`;
      assert.equal(preserved.n, 1);
      throw new Error('EXPECTED_TEST_ROLLBACK');
    });
  } catch (error) {
    if (error.message !== 'EXPECTED_TEST_ROLLBACK') throw error;
  }
  checks.push(
    'Başvuru + belge bağlama + referans + idempotency + durum değişimi + outbox hata dayanıklılığı; transaction geri alındı',
  );

  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(key, png, { contentType: 'image/png', upsert: false });
  assert.equal(uploadError, null);
  const { data: download, error: downloadError } = await admin.storage.from(bucket).download(key);
  assert.equal(downloadError, null);
  assert.equal(download.size, png.length);
  assert((await anon.storage.from(bucket).download(key)).error);
  const listing = await anon.storage.from(bucket).list('synthetic-verification');
  assert(listing.error || !listing.data?.length);
  const publicResponse = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`,
  );
  assert.notEqual(publicResponse.status, 200);
  const { data: signed, error: signError } = await admin.storage
    .from(bucket)
    .createSignedUrl(key, 30);
  assert.equal(signError, null);
  const signedResponse = await fetch(signed.signedUrl);
  assert.equal(signedResponse.status, 200);
  await signedResponse.arrayBuffer();
  checks.push(
    'Gerçek sentetik PNG upload/download + kısa süreli imzalı erişim; anonim listeleme/indirme/public URL reddi',
  );
  const { error: tableError } = await anon.from('applications').select('id');
  assert(tableError);
  const { error: rpcError } = await anon.rpc('claim_notifications');
  assert(rpcError);
  const settings = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: env.SUPABASE_ANON_KEY },
  });
  assert.equal(settings.status, 200);
  const auth = await settings.json();
  assert.equal(auth.disable_signup, true);
  checks.push('Genel signup Auth HTTP ayarında kapalı');
  console.log(
    JSON.stringify(
      { checks, signupDisabled: auth.disable_signup === true, realEmailSent: false },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    'SUPABASE_VERIFY_FAILED',
    error.code || error.name,
    error.stack?.match(/verify-supabase\.mjs:\d+:\d+/)?.[0],
    { completedChecks: checks.length },
  );
  process.exitCode = 1;
} finally {
  const removed = await admin.storage.from(bucket).remove([key]);
  if (removed.error) {
    console.error('SYNTHETIC_STORAGE_CLEANUP_FAILED');
    process.exitCode = 1;
  }
  await sql.end({ timeout: 3 });
}
