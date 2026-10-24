import assert from 'node:assert/strict';
import { connection } from '../scripts/supabase-connection.mjs';
const { sql } = connection();
try {
  for (const role of ['anon', 'authenticated']) {
    let denied = false;
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await tx`select nostos_ops.dispatch_jobs()`;
      });
    } catch (e) {
      denied = e.code === '42501';
    }
    assert(denied);
  }
  let closed = false;
  try {
    await sql`select nostos_ops.dispatch_jobs()`;
  } catch (e) {
    closed = e.message === 'JOB_HTTP_FAILED_503';
    if (!closed) console.log(JSON.stringify({ code: e.code, event: 'WORKER_VERIFY_FAILED' }));
  }
  assert(closed);
  const [job] = await sql`select active from cron.job where jobname='alvera-forms-worker'`;
  assert.equal(job.active, false);
  console.log(
    JSON.stringify({
      workerAuthenticatedRequestReachedApp: true,
      closedIntakeStatus: 503,
      unauthorizedExecutionDenied: true,
      jobActive: false,
    }),
  );
} finally {
  await sql.end();
}
