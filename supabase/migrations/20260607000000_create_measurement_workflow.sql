create extension if not exists pgcrypto;

do $$
begin
  create type public.workflow_mode as enum ('pre_quote_screening', 'quote_ready_review');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.property_status as enum ('draft', 'needs_review', 'approved', 'exported');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.measurement_status as enum ('needs_review', 'ready_for_approval', 'approved');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pitch_class as enum ('low', 'medium', 'steep', 'unknown');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.complexity_class as enum ('simple', 'moderate', 'complex');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.evidence_source_type as enum ('manual', 'public_data', 'provider_estimate', 'paid_api');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.risk_severity as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.audit_event_type as enum ('property_created', 'draft_generated', 'manual_edit', 'approved', 'exported');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  customer_notes text not null default '',
  job_notes text not null default '',
  include_garage boolean not null default true,
  include_shed boolean not null default false,
  workflow_mode public.workflow_mode not null default 'pre_quote_screening',
  status public.property_status not null default 'needs_review',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.measurement_drafts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null,
  status public.measurement_status not null default 'needs_review',
  roof_squares numeric(8, 1) not null check (roof_squares > 0),
  pitch_class public.pitch_class not null default 'unknown',
  waste_percent numeric(5, 2) not null check (waste_percent >= 0 and waste_percent <= 40),
  complexity_class public.complexity_class not null default 'moderate',
  confidence_score integer not null check (confidence_score >= 0 and confidence_score <= 100),
  included_structures text[] not null default array[]::text[],
  assumptions text[] not null default array[]::text[],
  raw_provider_payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.measurement_evidence (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.measurement_drafts(id) on delete cascade,
  source_type public.evidence_source_type not null,
  label text not null,
  detail text not null default '',
  source_url text,
  confidence_impact integer not null default 0,
  captured_at timestamptz not null default now()
);

create table if not exists public.measurement_risk_flags (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.measurement_drafts(id) on delete cascade,
  code text not null,
  label text not null,
  severity public.risk_severity not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.measurement_approvals (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.measurement_drafts(id) on delete set null,
  approved_roof_squares numeric(8, 1) not null check (approved_roof_squares > 0),
  approved_pitch_class public.pitch_class not null,
  approved_waste_percent numeric(5, 2) not null check (approved_waste_percent >= 0 and approved_waste_percent <= 40),
  approved_complexity_class public.complexity_class not null,
  confidence_score integer not null check (confidence_score >= 0 and confidence_score <= 100),
  included_structures text[] not null default array[]::text[],
  reviewer_name text not null,
  reviewer_notes text not null default '',
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.measurement_audit_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.measurement_drafts(id) on delete set null,
  approval_id uuid references public.measurement_approvals(id) on delete set null,
  event_type public.audit_event_type not null,
  actor_name text not null default 'System',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists properties_status_idx on public.properties(status);
create index if not exists measurement_drafts_property_id_idx on public.measurement_drafts(property_id);
create index if not exists measurement_evidence_property_id_idx on public.measurement_evidence(property_id);
create index if not exists measurement_risk_flags_property_id_idx on public.measurement_risk_flags(property_id);
create index if not exists measurement_approvals_property_id_idx on public.measurement_approvals(property_id);
create index if not exists measurement_audit_events_property_id_created_at_idx
  on public.measurement_audit_events(property_id, created_at desc);

alter table public.properties enable row level security;
alter table public.measurement_drafts enable row level security;
alter table public.measurement_evidence enable row level security;
alter table public.measurement_risk_flags enable row level security;
alter table public.measurement_approvals enable row level security;
alter table public.measurement_audit_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'properties',
    'measurement_drafts',
    'measurement_evidence',
    'measurement_risk_flags',
    'measurement_approvals',
    'measurement_audit_events'
  ]
  loop
    execute format('drop policy if exists "Internal users can read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Internal users can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Internal users can update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Internal users can delete %1$s" on public.%1$I', table_name);

    execute format('create policy "Internal users can read %1$s" on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy "Internal users can insert %1$s" on public.%1$I for insert to authenticated with check (true)', table_name);
    execute format('create policy "Internal users can update %1$s" on public.%1$I for update to authenticated using (true) with check (true)', table_name);
    execute format('create policy "Internal users can delete %1$s" on public.%1$I for delete to authenticated using (true)', table_name);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.properties,
  public.measurement_drafts,
  public.measurement_evidence,
  public.measurement_risk_flags,
  public.measurement_approvals,
  public.measurement_audit_events
to authenticated;
