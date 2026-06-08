alter table public.properties
  add column if not exists formatted_address text,
  add column if not exists google_place_id text,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists property_match_status text not null default 'typed_only',
  add column if not exists property_match_source text not null default 'manual',
  add column if not exists validation_granularity text,
  add column if not exists geocode_granularity text,
  add column if not exists address_complete boolean,
  add column if not exists validation_next_action text,
  add column if not exists property_match_detail text not null default 'Typed address has not been matched to a property yet.',
  add column if not exists property_match_payload jsonb not null default '{}'::jsonb,
  add column if not exists property_match_checked_at timestamptz;

alter table public.properties
  drop constraint if exists properties_property_match_status_check,
  add constraint properties_property_match_status_check
    check (property_match_status in (
      'typed_only',
      'selected_from_google',
      'validated',
      'needs_confirmation',
      'validation_failed'
    ));

alter table public.properties
  drop constraint if exists properties_property_match_source_check,
  add constraint properties_property_match_source_check
    check (property_match_source in ('manual', 'google_places', 'google_address_validation'));

alter table public.properties
  drop constraint if exists properties_latitude_check,
  add constraint properties_latitude_check
    check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.properties
  drop constraint if exists properties_longitude_check,
  add constraint properties_longitude_check
    check (longitude is null or (longitude >= -180 and longitude <= 180));

create index if not exists properties_google_place_id_idx
  on public.properties(google_place_id)
  where google_place_id is not null;
