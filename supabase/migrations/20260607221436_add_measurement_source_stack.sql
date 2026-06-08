alter table public.measurement_drafts
  add column if not exists accuracy_min_percent numeric(5, 2) not null default 10,
  add column if not exists accuracy_max_percent numeric(5, 2) not null default 25,
  add column if not exists source_stack_quality text not null default 'address_only',
  add column if not exists source_disagreement_percent numeric(5, 2);

alter table public.measurement_drafts
  drop constraint if exists measurement_drafts_accuracy_percent_check,
  add constraint measurement_drafts_accuracy_percent_check
    check (
      accuracy_min_percent >= 0
      and accuracy_max_percent >= accuracy_min_percent
      and accuracy_max_percent <= 100
    );

alter table public.measurement_drafts
  drop constraint if exists measurement_drafts_source_stack_quality_check,
  add constraint measurement_drafts_source_stack_quality_check
    check (source_stack_quality in ('address_only', 'footprint_backed', 'solar_backed', 'review_ready'));

alter table public.measurement_drafts
  drop constraint if exists measurement_drafts_source_disagreement_percent_check,
  add constraint measurement_drafts_source_disagreement_percent_check
    check (source_disagreement_percent is null or source_disagreement_percent >= 0);

create table if not exists public.measurement_source_runs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.measurement_drafts(id) on delete cascade,
  source_code text not null,
  source_label text not null,
  source_status text not null check (source_status in ('configured', 'unconfigured', 'available')),
  source_type public.evidence_source_type not null,
  source_role text not null check (source_role in ('address_match', 'roof_geometry', 'imagery', 'elevation', 'review')),
  detail text not null default '',
  expected_accuracy_min_percent numeric(5, 2),
  expected_accuracy_max_percent numeric(5, 2),
  payload jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint measurement_source_runs_expected_accuracy_check
    check (
      expected_accuracy_min_percent is null
      or (
        expected_accuracy_min_percent >= 0
        and expected_accuracy_max_percent >= expected_accuracy_min_percent
        and expected_accuracy_max_percent <= 100
      )
    )
);

create index if not exists measurement_source_runs_property_id_idx
  on public.measurement_source_runs(property_id);

create index if not exists measurement_source_runs_draft_id_idx
  on public.measurement_source_runs(draft_id);

alter table public.measurement_source_runs enable row level security;

drop policy if exists "Internal users can read measurement_source_runs" on public.measurement_source_runs;
drop policy if exists "Internal users can insert measurement_source_runs" on public.measurement_source_runs;
drop policy if exists "Internal users can update measurement_source_runs" on public.measurement_source_runs;
drop policy if exists "Internal users can delete measurement_source_runs" on public.measurement_source_runs;

create policy "Internal users can read measurement_source_runs"
  on public.measurement_source_runs for select to authenticated using (true);

create policy "Internal users can insert measurement_source_runs"
  on public.measurement_source_runs for insert to authenticated with check (true);

create policy "Internal users can update measurement_source_runs"
  on public.measurement_source_runs for update to authenticated using (true) with check (true);

create policy "Internal users can delete measurement_source_runs"
  on public.measurement_source_runs for delete to authenticated using (true);

grant select, insert, update, delete on public.measurement_source_runs to authenticated;
