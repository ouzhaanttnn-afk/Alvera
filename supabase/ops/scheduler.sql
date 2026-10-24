-- Operations setup, run only by the scoped installer as postgres.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions;
create schema if not exists nostos_ops;
revoke all on schema nostos_ops from public, anon, authenticated;
-- Synchronous http avoids persisting bearer headers in a pg_net request queue.
revoke all on vault.secrets, vault.decrypted_secrets from public, anon, authenticated;

create or replace function nostos_ops.dispatch_jobs()
returns integer language plpgsql security invoker
set search_path = pg_catalog
as $$
declare bearer text; response_status integer;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets
    where name = 'alvera_forms_cron_secret';
  if bearer is null then raise exception 'JOB_SECRET_MISSING'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','30000');
  select status into response_status from extensions.http((
    'POST',
    'https://nostos-forms-ouzhaanttnn-9387.vercel.app/api/jobs',
    array[extensions.http_header('Authorization','Bearer ' || bearer)],
    'application/json','{}'
  )::extensions.http_request);
  if response_status <> 200 then raise exception 'JOB_HTTP_FAILED_%', response_status; end if;
  return response_status;
end;
$$;
revoke all on function nostos_ops.dispatch_jobs() from public, anon, authenticated;
