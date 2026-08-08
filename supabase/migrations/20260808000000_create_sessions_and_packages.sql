create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  waybill text not null,
  zone_name text not null,
  driver_number integer not null,
  driver_type text not null,
  zip text not null,
  address text not null default '',
  stop_number integer not null,
  total_stops integer not null,
  is_pudo boolean not null default false,
  unique (session_id, waybill)
);

create index packages_waybill_idx on public.packages (waybill);
create index packages_session_id_idx on public.packages (session_id);

-- RLS is enabled with no policies on either table: all direct client access
-- (anon or authenticated) is denied. Reads and writes happen exclusively
-- through the save-session / lookup-package edge functions, which use the
-- service-role key and bypass RLS — so a public visitor can only ever fetch
-- the single package row they already know the waybill for, never list or
-- browse the tables.
alter table public.sessions enable row level security;
alter table public.packages enable row level security;
