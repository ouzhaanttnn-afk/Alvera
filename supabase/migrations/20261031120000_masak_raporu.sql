-- ALVERA MASAK RAPORU
-- Ayrı "masak" şeması: Supabase Data API'ye (PostgREST) açılmaz; sunucu doğrudan bağlanır ve her
-- kullanıcı sorgusunu "authenticated" rolü + request.jwt.claims ile çalıştırır. Böylece RLS her sorguda uygulanır.
-- Çoklu işletme: tüm iş tabloları organization_id taşır; ilişkiler (organization_id, id) bileşik FK ile aynı
-- işletmeye bağlanır, bir işletmenin kaydı başka işletmenin kaydına bağlanamaz.

create schema if not exists masak;
revoke all on schema masak from public;
grant usage on schema masak to authenticated;

-- Oturumdaki kullanıcı (Supabase auth.uid() ile aynı kaynağı okur, yerel ortamda da çalışır).
create function masak.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$$;

-- Rol -> izin matrisi. src/masak-raporu/permissions.ts ile aynı olmak zorundadır (testle doğrulanır).
create function masak.role_permissions(r text) returns text[] language sql immutable as $$
  select case r
    when 'owner' then array['records.read','records.write','sensitive.view','documents.download','documents.upload',
      'export.data','reports.confidential','cases.create','cases.view','cases.manage','links.decide','alerts.review',
      'rules.manage','rules.approve','members.manage','settings.manage','audit.view']
    when 'manager' then array['records.read','records.write','sensitive.view','documents.download','documents.upload',
      'export.data','cases.create','links.decide','alerts.review','rules.manage','members.manage','settings.manage','audit.view']
    when 'compliance_officer' then array['records.read','records.write','sensitive.view','documents.download','documents.upload',
      'export.data','reports.confidential','cases.create','cases.view','cases.manage','links.decide','alerts.review',
      'rules.manage','rules.approve','audit.view']
    when 'staff' then array['records.read','records.write','documents.upload','cases.create']
    when 'auditor' then array['records.read','export.data','audit.view']
    else array[]::text[] end
$$;

create table masak.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 200),
  legal_name text,
  tax_number text,
  address text,
  phone text,
  plan text not null default 'internal' check (plan in ('internal','trial','standard','professional')),
  status text not null default 'active' check (status in ('active','suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table masak.profiles (
  id uuid primary key references auth.users (id),
  email text not null,
  full_name text not null check (length(full_name) between 2 and 120),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

create table masak.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  user_id uuid not null references masak.profiles (id),
  role text not null check (role in ('owner','manager','compliance_officer','staff','auditor')),
  granted text[] not null default '{}' check (granted <@ array['sensitive.view','documents.download','export.data']),
  revoked text[] not null default '{}' check (revoked <@ array['sensitive.view','documents.download','export.data']),
  active boolean not null default true,
  invited_by uuid references masak.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index member_user on masak.organization_members (user_id) where active;

create function masak.has_perm(org uuid, perm text) returns boolean language sql stable security definer
set search_path = masak, pg_temp as $$
  select exists (
    select 1 from masak.organization_members m
    join masak.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = org and m.user_id = masak.uid() and m.active
      and ((perm = any (masak.role_permissions(m.role)) and not perm = any (m.revoked)) or perm = any (m.granted))
  )
$$;
create function masak.is_member(org uuid) returns boolean language sql stable security definer
set search_path = masak, pg_temp as $$
  select exists (select 1 from masak.organization_members m where m.organization_id = org and m.user_id = masak.uid() and m.active)
$$;

create table masak.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('manager','compliance_officer','staff','auditor','owner')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references masak.profiles (id),
  revoked_at timestamptz,
  -- Boş: ilk işletme sahibi için sunucu kurulum betiğiyle oluşturulan davet.
  created_by uuid references masak.profiles (id),
  created_at timestamptz not null default now()
);

-- Müşteriler. Kimlik numaraları uygulama katmanında AES-256-GCM ile şifreli tutulur (*_enc);
-- *_hash yalnızca mükerrer kontrol için HMAC'tir; *_masked ekranda gösterilen maskeli değerdir.
create table masak.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  kind text not null check (kind in ('natural','legal')),
  display_name text not null check (length(display_name) between 2 and 250),
  first_name text, last_name text, birth_date date, birth_place text, nationality text,
  mother_name text, father_name text,
  identity_type text check (identity_type in ('tc_kimlik_karti','nufus_cuzdani','pasaport','yabanci_kimlik','mavi_kart','diger')),
  identity_number_enc text, identity_hash text, identity_masked text,
  identity_document_number_enc text,
  legal_name text, tax_office text, tax_number_enc text, tax_hash text, tax_masked text,
  trade_registry_number text, activity text,
  address text, phone text, email text, occupation text,
  continuous_relationship boolean not null default false,
  identity_doubt boolean not null default false,
  risk_level text not null default 'standard' check (risk_level in ('low','standard','high')),
  risk_notes text,
  kvkk_notice_version text, kvkk_notice_given_at timestamptz,
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  version integer not null default 1,
  created_by uuid not null references masak.profiles (id),
  updated_by uuid references masak.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (kind = 'legal' or (first_name is not null and last_name is not null)),
  check (kind = 'natural' or legal_name is not null)
);
create index customer_search on masak.customers (organization_id, lower(display_name));
create index customer_identity on masak.customers (organization_id, identity_hash) where identity_hash is not null;
create index customer_tax on masak.customers (organization_id, tax_hash) where tax_hash is not null;

create table masak.customer_identity_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  method text not null check (method in ('belge_inceleme','ocr_destekli','resmi_sorgu','diger')),
  document_type text not null,
  checked_at timestamptz not null default now(),
  ocr_used boolean not null default false,
  ocr_confirmed boolean not null default false,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  confirmed_by uuid references masak.profiles (id),
  confirmed_at timestamptz,
  notes text,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id),
  -- OCR sonucu, kişi tarafından belgeyle karşılaştırılıp onaylanmadan teyit tamamlanmış sayılamaz.
  check (status <> 'verified' or (confirmed_by is not null and confirmed_at is not null)),
  check (status <> 'verified' or not ocr_used or ocr_confirmed)
);
create index identity_check_customer on masak.customer_identity_checks (organization_id, customer_id, checked_at desc);

create table masak.customer_representatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  relation text not null check (relation in ('yetkili_temsilci','vekil','kanuni_temsilci','diger')),
  full_name text not null,
  identity_number_enc text, identity_hash text, identity_masked text,
  nationality text,
  authority_document text,
  valid_until date,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id)
);

create table masak.beneficial_owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  full_name text not null,
  identity_number_enc text, identity_hash text, identity_masked text,
  nationality text,
  ownership_percent numeric(5,2) check (ownership_percent between 0 and 100),
  control_description text,
  notes text,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id)
);

-- İşlemler: tutarlar tam kuruş (bigint), gram değerleri numeric. Kayıtlar silinmez; tamamlanan işlem
-- yalnızca iptal veya düzeltme (yeni kayıt + eskisi "superseded") ile değişir.
create table masak.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  number text not null,
  occurred_at timestamptz not null,
  customer_id uuid not null,
  on_behalf_of_customer_id uuid,
  representative_id uuid references masak.customer_representatives (id),
  type text not null check (type in ('gold_sale','gold_purchase','scrap_gold_purchase','jewelry_sale','bullion',
    'exchange','return','other_precious')),
  product_description text not null check (length(product_description) between 2 and 500),
  karat smallint check (karat in (8,9,10,14,18,21,22,24)),
  weight_grams numeric(12,3) check (weight_grams >= 0),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_kurus bigint check (unit_price_kurus >= 0),
  total_kurus bigint not null check (total_kurus >= 0),
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(18,6) check (fx_rate > 0),
  fx_source text, fx_date date,
  total_try_kurus bigint not null check (total_try_kurus >= 0),
  payment_method text not null check (payment_method in ('nakit','banka_karti','kredi_karti','havale_eft','altin','karma','diger')),
  payment_reference text,
  invoice_reference text,
  related_transaction_id uuid,
  notes text,
  status text not null default 'completed' check (status in ('draft','completed','cancelled','superseded')),
  cancel_reason text, cancelled_at timestamptz, cancelled_by uuid references masak.profiles (id),
  corrects_transaction_id uuid,
  superseded_by uuid,
  import_batch text,
  is_demo boolean not null default false,
  version integer not null default 1,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id),
  foreign key (organization_id, on_behalf_of_customer_id) references masak.customers (organization_id, id),
  foreign key (organization_id, related_transaction_id) references masak.transactions (organization_id, id),
  foreign key (organization_id, corrects_transaction_id) references masak.transactions (organization_id, id),
  check (currency = 'TRY' or (fx_rate is not null and fx_source is not null and fx_date is not null)),
  check (status <> 'cancelled' or (cancel_reason is not null and cancelled_at is not null and cancelled_by is not null))
);
create index transaction_list on masak.transactions (organization_id, occurred_at desc);
create index transaction_customer on masak.transactions (organization_id, customer_id, occurred_at desc);

create table masak.transaction_link_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected')),
  basis text[] not null default '{}' check (basis <@ array['ayni_musteri','temsil_iliskisi','zaman_yakinligi','ortak_belge','odeme_iliskisi','diger']),
  rationale text not null check (length(rationale) >= 10),
  proposed_by uuid not null references masak.profiles (id),
  decided_by uuid references masak.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  version integer not null default 1,
  unique (organization_id, id),
  check (status = 'proposed' or (decided_by is not null and decided_at is not null and decision_note is not null))
);
create table masak.transaction_links (
  organization_id uuid not null,
  group_id uuid not null,
  transaction_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (group_id, transaction_id),
  foreign key (organization_id, group_id) references masak.transaction_link_groups (organization_id, id),
  foreign key (organization_id, transaction_id) references masak.transactions (organization_id, id)
);
create index link_transaction on masak.transaction_links (organization_id, transaction_id);

-- Tarihe bağlı kurallar. organization_id boş ise sistem geneli (yalnızca migration ile değişir).
create table masak.compliance_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references masak.organizations (id),
  rule_key text not null check (rule_key ~ '^[A-Z0-9-]+$'),
  version integer not null check (version > 0),
  title text not null,
  scope text not null,
  kind text not null check (kind in ('threshold_single','threshold_linked','continuous_relationship','suspicion',
    'identity_doubt','missing_data','risk_indicator')),
  level text not null check (level in ('info','review','high')),
  threshold_kurus bigint check (threshold_kurus > 0),
  params jsonb not null default '{}',
  valid_from date not null,
  valid_to date,
  source_url text not null,
  source_article text not null,
  last_verified_at date not null,
  legal_review_required boolean not null default true,
  status text not null default 'draft' check (status in ('draft','approved','active','retired')),
  created_by uuid references masak.profiles (id),
  approved_by uuid references masak.profiles (id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, rule_key, version),
  check (valid_to is null or valid_to >= valid_from),
  check (status not in ('approved','active') or organization_id is null or (approved_by is not null and approved_at is not null))
);

create table masak.compliance_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_id uuid not null,
  evaluated_at timestamptz not null default now(),
  transaction_version integer not null,
  rule_versions jsonb not null,
  findings jsonb not null,
  evaluated_by uuid references masak.profiles (id),
  foreign key (organization_id, transaction_id) references masak.transactions (organization_id, id)
);
create index evaluation_transaction on masak.compliance_evaluations (organization_id, transaction_id, evaluated_at desc);

create table masak.compliance_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  fingerprint text not null,
  transaction_id uuid,
  customer_id uuid,
  link_group_id uuid,
  rule_key text not null,
  rule_version integer not null,
  level text not null check (level in ('info','review','high')),
  title text not null,
  rationale text not null,
  source_url text not null,
  source_article text not null,
  confidential boolean not null default false,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fingerprint),
  unique (organization_id, id),
  foreign key (organization_id, transaction_id) references masak.transactions (organization_id, id),
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id)
);
create index alert_open on masak.compliance_alerts (organization_id, status, level, created_at desc);

create table masak.alert_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  alert_id uuid not null,
  decision text not null check (decision in ('acknowledged','resolved','dismissed','reopened','note')),
  note text not null check (length(note) >= 5),
  actor_id uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, alert_id) references masak.compliance_alerts (organization_id, id)
);

-- Şüpheli işlem iç değerlendirme kayıtları: gizlidir, yalnızca cases.view izni olanlar görür.
create table masak.risk_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  number text not null,
  title text not null check (length(title) between 3 and 200),
  reason_category text not null,
  description text not null check (length(description) >= 10),
  suspicion_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'submitted' check (status in ('submitted','investigating','info_needed','report_considered',
    'reported_externally','closed')),
  assigned_to uuid references masak.profiles (id),
  decision_reason text,
  official_report_date date,
  official_report_reference text,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (organization_id, number),
  unique (organization_id, id),
  check (status <> 'reported_externally' or (official_report_date is not null and official_report_reference is not null)),
  check (status <> 'closed' or decision_reason is not null)
);
create table masak.risk_case_transactions (
  organization_id uuid not null,
  case_id uuid not null,
  transaction_id uuid not null,
  primary key (case_id, transaction_id),
  foreign key (organization_id, case_id) references masak.risk_cases (organization_id, id),
  foreign key (organization_id, transaction_id) references masak.transactions (organization_id, id)
);
create table masak.risk_case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  actor_id uuid not null references masak.profiles (id),
  kind text not null check (kind in ('submitted','status','note','assignment','official_report','document','link')),
  from_status text, to_status text,
  note text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references masak.risk_cases (organization_id, id)
);

-- Belgeler: meta veri ayrı, depolama anahtarı ayrı tabloda; anahtar yalnızca izin kontrolü yapan fonksiyonla okunur.
create table masak.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  customer_id uuid,
  transaction_id uuid,
  case_id uuid,
  kind text not null check (kind in ('kimlik_belgesi','vekaletname','imza_sirküleri','fatura','odeme_dekontu','vergi_levhasi',
    'ticaret_sicil','ic_inceleme','diger')),
  title text not null,
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1,
  supersedes_id uuid,
  superseded boolean not null default false,
  confidential boolean not null default false,
  retention_until date,
  legal_hold boolean not null default false,
  deletion_status text not null default 'none' check (deletion_status in ('none','review_requested','approved_for_deletion','retained')),
  uploaded_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references masak.customers (organization_id, id),
  foreign key (organization_id, transaction_id) references masak.transactions (organization_id, id),
  foreign key (organization_id, case_id) references masak.risk_cases (organization_id, id),
  foreign key (organization_id, supersedes_id) references masak.documents (organization_id, id),
  check (case_id is null or confidential)
);
create table masak.document_blobs (
  document_id uuid primary key references masak.documents (id),
  organization_id uuid not null,
  storage_key text not null unique check (storage_key ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$')
);

create table masak.report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  report_type text not null check (report_type in ('A','B','C','D','E','F','G','H','I','ZIP','CSV')),
  format text not null check (format in ('pdf','csv','zip')),
  reference text not null,
  filters jsonb not null default '{}',
  record_count integer not null default 0,
  record_versions jsonb not null default '[]',
  sha256 text,
  confidential boolean not null default false,
  created_by uuid not null references masak.profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table masak.data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references masak.organizations (id),
  entity_type text not null check (entity_type in ('customers','transactions','documents','risk_cases','audit_events','reports')),
  retention_years integer not null check (retention_years between 1 and 50),
  basis text not null,
  legal_review_status text not null default 'pending' check (legal_review_status in ('pending','approved')),
  approved_by uuid references masak.profiles (id),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type)
);

-- Değişmez denetim izi (hash zinciri) ve kayıt versiyonları.
create table masak.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references masak.organizations (id),
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}',
  confidential boolean not null default false,
  created_at timestamptz not null default now(),
  prev_hash text,
  hash text not null default ''
);
create index audit_lookup on masak.audit_events (organization_id, created_at desc);
create index audit_entity on masak.audit_events (organization_id, entity_id, created_at desc);

create table masak.record_versions (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  version integer not null,
  operation text not null,
  snapshot jsonb not null,
  confidential boolean not null default false,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index record_version_entity on masak.record_versions (organization_id, entity_id, version);

create table masak.counters (
  organization_id uuid not null references masak.organizations (id),
  kind text not null,
  year integer not null,
  value bigint not null,
  primary key (organization_id, kind, year)
);
create table masak.rate_limits (key text primary key, hits integer not null, expires timestamptz not null);

-- ---------- Tetikleyiciler ----------
create function masak.audit_hash() returns trigger language plpgsql security definer set search_path = masak, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 77));
  select hash into new.prev_hash from masak.audit_events where organization_id = new.organization_id order by id desc limit 1;
  new.hash := encode(sha256(convert_to(coalesce(new.prev_hash, '') || '|' || new.organization_id || '|' ||
    coalesce(new.actor_id::text, '') || '|' || new.action || '|' || coalesce(new.entity_type, '') || '|' ||
    coalesce(new.entity_id::text, '') || '|' || new.details::text || '|' || to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex');
  return new;
end $$;
create trigger audit_hash before insert on masak.audit_events for each row execute function masak.audit_hash();

create function masak.forbid_change() returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE_RECORD' using errcode = '42501'; end $$;
create trigger audit_immutable before update or delete on masak.audit_events for each row execute function masak.forbid_change();
create trigger version_immutable before update or delete on masak.record_versions for each row execute function masak.forbid_change();
create trigger review_immutable before update or delete on masak.alert_reviews for each row execute function masak.forbid_change();
create trigger case_event_immutable before update or delete on masak.risk_case_events for each row execute function masak.forbid_change();
create trigger evaluation_immutable before update or delete on masak.compliance_evaluations for each row execute function masak.forbid_change();
do $$ declare t text; begin
  foreach t in array array['customers','customer_identity_checks','customer_representatives','beneficial_owners','transactions',
    'transaction_link_groups','risk_cases','documents','report_exports','organizations','invitations'] loop
    execute format('create trigger %I before delete on masak.%I for each row execute function masak.forbid_change()', 'no_delete_' || t, t);
  end loop;
end $$;

create function masak.bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  if to_jsonb(new) ? 'updated_at' then new := jsonb_populate_record(new, jsonb_build_object('updated_at', now())); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['customers','customer_identity_checks','customer_representatives','beneficial_owners','transactions',
    'transaction_link_groups','risk_cases'] loop
    execute format('create trigger %I before update on masak.%I for each row execute function masak.bump_version()', 'bump_' || t, t);
  end loop;
end $$;

create function masak.capture_version() returns trigger language plpgsql security definer set search_path = masak, pg_temp as $$
declare snap jsonb := to_jsonb(new);
begin
  if snap->>'organization_id' is null then return new; end if;
  insert into masak.record_versions (organization_id, entity_type, entity_id, version, operation, snapshot, confidential, changed_by)
  values (new.organization_id, tg_table_name, new.id, coalesce((snap->>'version')::int, 1), lower(tg_op), snap,
    tg_table_name = 'risk_cases' or coalesce((snap->>'confidential')::boolean, false), masak.uid());
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['customers','customer_identity_checks','customer_representatives','beneficial_owners','transactions',
    'transaction_link_groups','risk_cases','documents','organization_members','compliance_rules'] loop
    execute format('create trigger %I after insert or update on masak.%I for each row execute function masak.capture_version()', 'version_' || t, t);
  end loop;
end $$;

-- Tamamlanmış işlem değiştirilemez; yalnızca iptal (gerekçeli) ya da düzeltme ile "superseded" olur.
create function masak.guard_transaction() returns trigger language plpgsql as $$
begin
  if old.status = 'draft' then return new; end if;
  if old.status in ('cancelled','superseded') then raise exception 'TRANSACTION_CLOSED' using errcode = '42501'; end if;
  if new.status not in ('cancelled','superseded') then raise exception 'TRANSACTION_IMMUTABLE' using errcode = '42501'; end if;
  if (to_jsonb(new) - array['status','cancel_reason','cancelled_at','cancelled_by','superseded_by','version','updated_at'])
     <> (to_jsonb(old) - array['status','cancel_reason','cancelled_at','cancelled_by','superseded_by','version','updated_at']) then
    raise exception 'TRANSACTION_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_transaction before update on masak.transactions for each row execute function masak.guard_transaction();

-- Kural: sistem genel kuralları ve onaylanan kurallar içerik olarak değiştirilemez; yeni versiyon açılır.
create function masak.guard_rule() returns trigger language plpgsql as $$
begin
  if old.organization_id is null and masak.uid() is not null then raise exception 'GLOBAL_RULE_READONLY' using errcode = '42501'; end if;
  if old.status in ('approved','active','retired') and
     (to_jsonb(new) - array['status','valid_to','approved_by','approved_at','notes']) <> (to_jsonb(old) - array['status','valid_to','approved_by','approved_at','notes']) then
    raise exception 'RULE_IMMUTABLE' using errcode = '42501';
  end if;
  if new.status in ('approved','active') and old.status = 'draft' and not masak.has_perm(new.organization_id, 'rules.approve') then
    raise exception 'RULE_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_rule before update on masak.compliance_rules for each row execute function masak.guard_rule();

-- En az bir aktif işletme sahibi kalmalı.
create function masak.guard_owner() returns trigger language plpgsql security definer set search_path = masak, pg_temp as $$
begin
  if old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active) and not exists (
    select 1 from masak.organization_members where organization_id = old.organization_id and role = 'owner' and active and id <> old.id) then
    raise exception 'LAST_OWNER' using errcode = '42501';
  end if;
  if (new.role = 'owner' or old.role = 'owner') and masak.uid() is not null and
     not exists (select 1 from masak.organization_members where organization_id = old.organization_id and user_id = masak.uid() and role = 'owner' and active) then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_owner before update on masak.organization_members for each row execute function masak.guard_owner();

-- ---------- Fonksiyonlar ----------
create function masak.next_number(org uuid, p_kind text) returns text language plpgsql security definer set search_path = masak, pg_temp as $$
declare yr int := extract(year from now() at time zone 'Europe/Istanbul'); v bigint; prefix text;
begin
  if not (masak.has_perm(org, 'records.write') or masak.has_perm(org, 'cases.create') or masak.has_perm(org, 'export.data')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  prefix := case p_kind when 'transaction' then 'ISL' when 'case' then 'INC' when 'report' then 'RPR' else null end;
  if prefix is null then raise exception 'INVALID_KIND'; end if;
  insert into masak.counters values (org, p_kind, yr, 1)
  on conflict (organization_id, kind, year) do update set value = masak.counters.value + 1 returning value into v;
  return prefix || '-' || yr || '-' || lpad(v::text, 6, '0');
end $$;

-- Personel bir şüpheyi bildirir; kaydı sonradan göremez (gizlilik), yalnızca numara döner.
create function masak.submit_case(org uuid, p_title text, p_reason text, p_description text, p_suspicion_at timestamptz,
  p_due_at timestamptz, p_transactions uuid[]) returns text language plpgsql security definer set search_path = masak, pg_temp as $$
declare c_id uuid := gen_random_uuid(); num text; t uuid;
begin
  if not masak.has_perm(org, 'cases.create') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  num := masak.next_number(org, 'case');
  insert into masak.risk_cases (id, organization_id, number, title, reason_category, description, suspicion_at, due_at, created_by)
  values (c_id, org, num, p_title, p_reason, p_description, p_suspicion_at, p_due_at, masak.uid());
  foreach t in array coalesce(p_transactions, '{}') loop
    if not exists (select 1 from masak.transactions where organization_id = org and id = t) then raise exception 'INVALID_TRANSACTION'; end if;
    insert into masak.risk_case_transactions values (org, c_id, t);
  end loop;
  insert into masak.risk_case_events (organization_id, case_id, actor_id, kind, to_status, note) values (org, c_id, masak.uid(), 'submitted', 'submitted', 'İç değerlendirme kaydı oluşturuldu.');
  insert into masak.audit_events (organization_id, actor_id, action, entity_type, entity_id, confidential) values (org, masak.uid(), 'case.submitted', 'risk_cases', c_id, true);
  return num;
end $$;

-- Belge indirme yetkisi veritabanında doğrulanır ve her erişim denetim izine yazılır.
create function masak.authorize_document(doc uuid) returns table (storage_key text, mime text, title text, sha256 text)
language plpgsql security definer set search_path = masak, pg_temp as $$
declare d masak.documents;
begin
  select * into d from masak.documents where id = doc;
  if not found or not masak.has_perm(d.organization_id, 'documents.download')
     or (d.confidential and not masak.has_perm(d.organization_id, 'cases.view')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into masak.audit_events (organization_id, actor_id, action, entity_type, entity_id, confidential)
  values (d.organization_id, masak.uid(), 'document.download', 'documents', d.id, d.confidential);
  return query select b.storage_key, d.mime, d.title, d.sha256 from masak.document_blobs b where b.document_id = d.id;
end $$;

create function masak.register_blob(doc uuid, key text) returns void language plpgsql security definer set search_path = masak, pg_temp as $$
declare d masak.documents;
begin
  select * into d from masak.documents where id = doc;
  if not found or not masak.has_perm(d.organization_id, 'documents.upload') or d.uploaded_by <> masak.uid()
     or exists (select 1 from masak.document_blobs where document_id = doc) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if split_part(key, '/', 1) <> d.organization_id::text then raise exception 'INVALID_KEY'; end if;
  insert into masak.document_blobs values (doc, d.organization_id, key);
end $$;

create function masak.hit_rate(p_key text, p_limit int, p_seconds int) returns boolean language plpgsql security definer set search_path = masak, pg_temp as $$
declare h int;
begin
  delete from masak.rate_limits where expires < now();
  insert into masak.rate_limits values (p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict (key) do update set hits = masak.rate_limits.hits + 1 returning hits into h;
  return h <= p_limit;
end $$;

-- Kural motoru uyarıları bu fonksiyonla yazılır: gözden geçirilmiş uyarının durumu değiştirilemez,
-- gizli (iç inceleme kaynaklı) uyarıyı yalnızca cases.view izni olan oluşturabilir.
create function masak.upsert_alerts(org uuid, items jsonb) returns integer language plpgsql security definer set search_path = masak, pg_temp as $$
declare i jsonb; n int := 0;
begin
  if not masak.has_perm(org, 'records.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  for i in select * from jsonb_array_elements(items) loop
    if coalesce((i->>'confidential')::boolean, false) and not masak.has_perm(org, 'cases.view') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    insert into masak.compliance_alerts (organization_id, fingerprint, transaction_id, customer_id, link_group_id, rule_key, rule_version,
      level, title, rationale, source_url, source_article, confidential)
    values (org, i->>'fingerprint', (i->>'transaction_id')::uuid, (i->>'customer_id')::uuid, (i->>'link_group_id')::uuid, i->>'rule_key',
      (i->>'rule_version')::int, i->>'level', i->>'title', i->>'rationale', i->>'source_url', i->>'source_article',
      coalesce((i->>'confidential')::boolean, false))
    on conflict (organization_id, fingerprint) do update set level = excluded.level, title = excluded.title, rationale = excluded.rationale,
      rule_version = excluded.rule_version, source_url = excluded.source_url, source_article = excluded.source_article, updated_at = now()
      where masak.compliance_alerts.status = 'open';
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Satır düzeyi güvenlik ----------
do $$ declare t text; begin
  foreach t in array array['organizations','profiles','organization_members','invitations','customers','customer_identity_checks',
    'customer_representatives','beneficial_owners','transactions','transaction_link_groups','transaction_links','compliance_rules',
    'compliance_evaluations','compliance_alerts','alert_reviews','risk_cases','risk_case_transactions','risk_case_events','documents',
    'document_blobs','report_exports','data_retention_policies','audit_events','record_versions','counters','rate_limits'] loop
    execute format('alter table masak.%I enable row level security', t);
    execute format('revoke all on masak.%I from public, anon, authenticated', t);
  end loop;
end $$;

grant select, update on masak.organizations to authenticated;
create policy org_read on masak.organizations for select to authenticated using (masak.is_member(id));
create policy org_update on masak.organizations for update to authenticated using (masak.has_perm(id, 'settings.manage')) with check (masak.has_perm(id, 'settings.manage'));

grant select, update (full_name) on masak.profiles to authenticated;
create policy profile_read on masak.profiles for select to authenticated using (
  id = masak.uid() or exists (select 1 from masak.organization_members m where m.user_id = profiles.id and masak.is_member(m.organization_id)));
create policy profile_update on masak.profiles for update to authenticated using (id = masak.uid()) with check (id = masak.uid());

grant select, update (role, granted, revoked, active) on masak.organization_members to authenticated;
create policy member_read on masak.organization_members for select to authenticated using (masak.is_member(organization_id));
create policy member_update on masak.organization_members for update to authenticated
  using (masak.has_perm(organization_id, 'members.manage') and user_id <> masak.uid())
  with check (masak.has_perm(organization_id, 'members.manage'));

grant select, insert, update (revoked_at) on masak.invitations to authenticated;
create policy invite_read on masak.invitations for select to authenticated using (masak.has_perm(organization_id, 'members.manage'));
create policy invite_insert on masak.invitations for insert to authenticated with check (
  masak.has_perm(organization_id, 'members.manage') and created_by = masak.uid() and accepted_at is null
  and (role <> 'owner' or exists (select 1 from masak.organization_members m where m.organization_id = invitations.organization_id and m.user_id = masak.uid() and m.role = 'owner' and m.active)));
create policy invite_revoke on masak.invitations for update to authenticated using (masak.has_perm(organization_id, 'members.manage')) with check (masak.has_perm(organization_id, 'members.manage'));

do $$ declare t text; begin
  foreach t in array array['customers','customer_identity_checks','customer_representatives','beneficial_owners'] loop
    execute format('grant select, insert, update on masak.%I to authenticated', t);
    execute format('create policy %I on masak.%I for select to authenticated using (masak.has_perm(organization_id, ''records.read''))', t || '_read', t);
    execute format('create policy %I on masak.%I for insert to authenticated with check (masak.has_perm(organization_id, ''records.write'') and created_by = masak.uid())', t || '_insert', t);
    execute format('create policy %I on masak.%I for update to authenticated using (masak.has_perm(organization_id, ''records.write'')) with check (masak.has_perm(organization_id, ''records.write''))', t || '_update', t);
  end loop;
end $$;

grant select, insert, update on masak.transactions to authenticated;
create policy transactions_read on masak.transactions for select to authenticated using (masak.has_perm(organization_id, 'records.read'));
create policy transactions_insert on masak.transactions for insert to authenticated with check (masak.has_perm(organization_id, 'records.write') and created_by = masak.uid());
create policy transactions_update on masak.transactions for update to authenticated using (masak.has_perm(organization_id, 'records.write')) with check (masak.has_perm(organization_id, 'records.write'));

grant select, insert, update (status, decided_by, decided_at, decision_note) on masak.transaction_link_groups to authenticated;
create policy link_groups_read on masak.transaction_link_groups for select to authenticated using (masak.has_perm(organization_id, 'records.read'));
create policy link_groups_insert on masak.transaction_link_groups for insert to authenticated with check (masak.has_perm(organization_id, 'records.write') and proposed_by = masak.uid() and status = 'proposed');
create policy link_groups_decide on masak.transaction_link_groups for update to authenticated using (masak.has_perm(organization_id, 'links.decide')) with check (masak.has_perm(organization_id, 'links.decide') and decided_by = masak.uid());
grant select, insert on masak.transaction_links to authenticated;
create policy links_read on masak.transaction_links for select to authenticated using (masak.has_perm(organization_id, 'records.read'));
create policy links_insert on masak.transaction_links for insert to authenticated with check (masak.has_perm(organization_id, 'records.write')
  and exists (select 1 from masak.transaction_link_groups g where g.id = group_id and g.status = 'proposed'));

grant select, insert, update on masak.compliance_rules to authenticated;
create policy rules_read on masak.compliance_rules for select to authenticated using (organization_id is null or masak.is_member(organization_id));
create policy rules_insert on masak.compliance_rules for insert to authenticated with check (organization_id is not null and masak.has_perm(organization_id, 'rules.manage') and status = 'draft' and created_by = masak.uid());
create policy rules_update on masak.compliance_rules for update to authenticated using (organization_id is not null and masak.has_perm(organization_id, 'rules.manage')) with check (organization_id is not null and masak.has_perm(organization_id, 'rules.manage'));

grant select, insert on masak.compliance_evaluations to authenticated;
create policy evaluations_read on masak.compliance_evaluations for select to authenticated using (masak.has_perm(organization_id, 'records.read'));
create policy evaluations_insert on masak.compliance_evaluations for insert to authenticated with check (masak.has_perm(organization_id, 'records.write'));

grant select, update (status, updated_at) on masak.compliance_alerts to authenticated;
create policy alerts_read on masak.compliance_alerts for select to authenticated using (
  masak.has_perm(organization_id, 'records.read') and (not confidential or masak.has_perm(organization_id, 'cases.view')));
create policy alerts_update on masak.compliance_alerts for update to authenticated using (
  masak.has_perm(organization_id, 'alerts.review') and (not confidential or masak.has_perm(organization_id, 'cases.view')))
  with check (masak.has_perm(organization_id, 'alerts.review'));
grant select, insert on masak.alert_reviews to authenticated;
create policy reviews_read on masak.alert_reviews for select to authenticated using (masak.has_perm(organization_id, 'records.read')
  and exists (select 1 from masak.compliance_alerts a where a.id = alert_id));
create policy reviews_insert on masak.alert_reviews for insert to authenticated with check (masak.has_perm(organization_id, 'alerts.review') and actor_id = masak.uid());

grant select, update (status, assigned_to, decision_reason, official_report_date, official_report_reference, updated_at) on masak.risk_cases to authenticated;
create policy cases_read on masak.risk_cases for select to authenticated using (masak.has_perm(organization_id, 'cases.view'));
create policy cases_update on masak.risk_cases for update to authenticated using (masak.has_perm(organization_id, 'cases.manage')) with check (masak.has_perm(organization_id, 'cases.manage'));
grant select, insert on masak.risk_case_transactions to authenticated;
create policy case_tx_read on masak.risk_case_transactions for select to authenticated using (masak.has_perm(organization_id, 'cases.view'));
create policy case_tx_insert on masak.risk_case_transactions for insert to authenticated with check (masak.has_perm(organization_id, 'cases.manage'));
grant select, insert on masak.risk_case_events to authenticated;
create policy case_events_read on masak.risk_case_events for select to authenticated using (masak.has_perm(organization_id, 'cases.view'));
create policy case_events_insert on masak.risk_case_events for insert to authenticated with check (masak.has_perm(organization_id, 'cases.manage') and actor_id = masak.uid());

grant select, insert, update (superseded, deletion_status, legal_hold, retention_until) on masak.documents to authenticated;
create policy documents_read on masak.documents for select to authenticated using (
  masak.has_perm(organization_id, 'records.read') and (not confidential or masak.has_perm(organization_id, 'cases.view')));
create policy documents_insert on masak.documents for insert to authenticated with check (
  masak.has_perm(organization_id, 'documents.upload') and uploaded_by = masak.uid()
  and (not confidential or masak.has_perm(organization_id, 'cases.manage')));
create policy documents_update on masak.documents for update to authenticated using (
  masak.has_perm(organization_id, 'documents.upload') and (not confidential or masak.has_perm(organization_id, 'cases.manage')))
  with check (masak.has_perm(organization_id, 'documents.upload'));
-- document_blobs: politika yok; yalnızca authorize_document / register_blob üzerinden.

grant select, insert on masak.report_exports to authenticated;
create policy exports_read on masak.report_exports for select to authenticated using (
  masak.has_perm(organization_id, 'export.data') and (not confidential or masak.has_perm(organization_id, 'reports.confidential')));
create policy exports_insert on masak.report_exports for insert to authenticated with check (
  masak.has_perm(organization_id, 'export.data') and created_by = masak.uid()
  and (not confidential or masak.has_perm(organization_id, 'reports.confidential')));

grant select, insert, update on masak.data_retention_policies to authenticated;
create policy retention_read on masak.data_retention_policies for select to authenticated using (masak.is_member(organization_id));
create policy retention_write on masak.data_retention_policies for insert to authenticated with check (masak.has_perm(organization_id, 'settings.manage'));
create policy retention_update on masak.data_retention_policies for update to authenticated using (masak.has_perm(organization_id, 'settings.manage')) with check (masak.has_perm(organization_id, 'settings.manage'));

grant select, insert on masak.audit_events to authenticated;
create policy audit_read on masak.audit_events for select to authenticated using (
  masak.has_perm(organization_id, 'audit.view') and (not confidential or masak.has_perm(organization_id, 'cases.view')));
create policy audit_insert on masak.audit_events for insert to authenticated with check (masak.is_member(organization_id) and actor_id = masak.uid());

grant select on masak.record_versions to authenticated;
create policy versions_read on masak.record_versions for select to authenticated using (
  masak.has_perm(organization_id, 'audit.view') and (not confidential or masak.has_perm(organization_id, 'cases.view')));

revoke all on all functions in schema masak from public;
grant execute on function masak.uid(), masak.role_permissions(text), masak.has_perm(uuid, text), masak.is_member(uuid),
  masak.next_number(uuid, text), masak.submit_case(uuid, text, text, text, timestamptz, timestamptz, uuid[]),
  masak.authorize_document(uuid), masak.register_blob(uuid, text), masak.upsert_alerts(uuid, jsonb) to authenticated;
