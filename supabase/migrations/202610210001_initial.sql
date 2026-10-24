-- Run with the Supabase migration owner. No anonymous/authenticated table access.
create table public.applications (
 id uuid primary key, reference text unique not null, created_at timestamptz not null default now(),
 status text not null check(status in ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','REJECTED')),
 kind text not null check(kind in ('individual','corporate')), masked_identity text not null,
 payload text not null, intake_id uuid unique not null, deletion_requested_at timestamptz, notice_version text not null
);
create table public.application_documents (
 id uuid primary key, application_id uuid references public.applications on delete cascade,
 intake_id uuid not null, kind text not null check(kind in ('front','back','signature')),
 path text unique not null, mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 size integer not null check(size>0 and size<=10485760), created_at timestamptz not null default now()
);
create unique index application_document_kind on public.application_documents(application_id,kind) where application_id is not null;
create index pending_documents on public.application_documents(created_at) where application_id is null;
create table public.application_signatures(document_id uuid primary key references public.application_documents on delete cascade, application_id uuid not null references public.applications on delete cascade);
create table public.application_status_history(id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications on delete cascade,created_at timestamptz not null default now(),actor text not null,action text not null,status text,note text);
create table public.admin_users(id uuid primary key references auth.users on delete cascade,active boolean not null default true,created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),application_id uuid,created_at timestamptz not null default now(),actor text not null,action text not null);
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications on delete cascade,audience text not null check(audience in ('admin','applicant')),state text not null default 'pending' check(state in ('pending','processing','sent','failed')),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,last_error text,created_at timestamptz not null default now(),unique(application_id,audience));
create table public.rate_limits(key text primary key,hits integer not null,expires timestamptz not null);
create table public.reference_counters(year integer primary key,value bigint not null);
create index application_search on public.applications(status,created_at desc);
create index history_lookup on public.application_status_history(application_id,created_at desc);
create index outbox_pending on public.notification_outbox(state,next_attempt_at);

do $$ declare t text; begin
 foreach t in array array['applications','application_documents','application_signatures','application_status_history','admin_users','audit_logs','notification_outbox','rate_limits','reference_counters'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.register_document(v jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(v->>'intake_id',0));
 if exists(select 1 from applications where intake_id=(v->>'intake_id')::uuid) then raise exception 'already submitted'; end if;
 insert into application_documents(id,intake_id,kind,path,mime,size) values((v->>'id')::uuid,(v->>'intake_id')::uuid,v->>'kind',v->>'path',v->>'mime',(v->>'size')::int);
end $$;

create function public.submit_application(v jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare a applications; yr integer; counter bigint; doc_id text; doc application_documents; seen text[]='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended(v->>'intake',0));
 select * into a from applications where intake_id=(v->>'intake')::uuid;
 if found then return to_jsonb(a); end if;
 for doc_id in select jsonb_array_elements_text(v->'documents') loop
   select * into doc from application_documents where id=doc_id::uuid and intake_id=(v->>'intake')::uuid and application_id is null for update;
   if not found or doc.kind=any(seen) then raise exception 'invalid document'; end if;
   seen=array_append(seen,doc.kind);
 end loop;
 yr=extract(year from now() at time zone 'UTC');
 insert into reference_counters values(yr,1) on conflict(year) do update set value=reference_counters.value+1 returning value into counter;
 insert into applications(id,reference,status,kind,masked_identity,payload,intake_id,notice_version)
 values((v->>'id')::uuid,'NF-'||yr||'-'||lpad(counter::text,greatest(6,length(counter::text)),'0'),'SUBMITTED',v->>'kind',v->>'masked',v->>'payload',(v->>'intake')::uuid,v->>'notice') returning * into a;
 update application_documents set application_id=a.id where id in(select jsonb_array_elements_text(v->'documents')::uuid);
 insert into application_signatures select id,a.id from application_documents where application_id=a.id and kind='signature';
 insert into application_status_history(application_id,actor,action,status) values(a.id,'applicant','SUBMITTED','SUBMITTED');
 insert into audit_logs(application_id,actor,action) values(a.id,'applicant','SUBMITTED');
 insert into notification_outbox(application_id,audience) values(a.id,'admin');
 if (v->>'receipt')::boolean then insert into notification_outbox(application_id,audience) values(a.id,'applicant'); end if;
 return to_jsonb(a);
end $$;

create function public.admin_action(app_id uuid,actor text,action text,new_status text,note text) returns void language plpgsql security definer set search_path=public as $$
declare a applications; allowed boolean;
begin
 select * into a from applications where id=app_id for update;
 if not found then raise exception 'not found'; end if;
 if action='STATUS_CHANGED' then
   allowed=(a.status='SUBMITTED' and new_status in ('IN_REVIEW','REJECTED')) or (a.status='IN_REVIEW' and new_status in ('APPROVED','REJECTED')) or (a.status='REJECTED' and new_status='IN_REVIEW');
   if allowed is not true then raise exception 'invalid transition'; end if;
   update applications set status=new_status where id=app_id;
 elsif action='DELETION_REQUESTED' then update applications set deletion_requested_at=now() where id=app_id;
 elsif action='DELETED' then
   if a.deletion_requested_at is null then raise exception 'deletion not requested'; end if;
   delete from applications where id=app_id;
 elsif action<>'NOTE_ADDED' then raise exception 'invalid action';
 end if;
 insert into audit_logs(application_id,actor,action) values(app_id,actor,action);
 if action<>'DELETED' then insert into application_status_history(application_id,actor,action,status,note) values(app_id,actor,action,new_status,note); end if;
end $$;

create function public.claim_notifications() returns setof public.notification_outbox language sql security definer set search_path=public as $$
 update notification_outbox set state='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 where id in(select id from notification_outbox where attempts<8 and created_at>now()-interval '23 hours' and ((state in ('pending','failed') and next_attempt_at<=now()) or (state='processing' and lease_until<now())) order by created_at for update skip locked limit 20) returning *;
$$;
create function public.finish_notification(item_id uuid,lease timestamptz,success boolean) returns void language sql security definer set search_path=public as $$
 update notification_outbox set state=case when success then 'sent' else 'failed' end,last_error=case when success then null else 'DELIVERY_FAILED' end,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts))::int) where id=item_id and lease_until=lease;
$$;
create function public.take_rate_limit(rate_key text,max_hits integer,window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 delete from rate_limits where expires<now();
 insert into rate_limits values(rate_key,1,now()+make_interval(secs=>window_seconds)) on conflict(key) do update set hits=rate_limits.hits+1 returning hits into n;
 return n<=max_hits;
end $$;

-- Service-only RPCs; SECURITY DEFINER never exposes a public privilege escalation.
revoke all on function public.register_document(jsonb),public.submit_application(jsonb),public.admin_action(uuid,text,text,text,text),public.claim_notifications(),public.finish_notification(uuid,timestamptz,boolean),public.take_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.register_document(jsonb),public.submit_application(jsonb),public.admin_action(uuid,text,text,text,text),public.claim_notifications(),public.finish_notification(uuid,timestamptz,boolean),public.take_rate_limit(text,integer,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('application-private','application-private',false,10485760,array['image/jpeg','image/png','application/pdf']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
-- Intentionally no storage.objects policies for anon/authenticated. Server mediates access.
