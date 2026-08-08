-- packages.created_at lets lookup-package order by "most recent session" with
-- a single-table query, instead of an embedded join+order on sessions
-- (which turned out not to sort correctly through supabase-js/PostgREST).
alter table public.packages
  add column created_at timestamptz not null default now();

create index packages_waybill_created_at_idx on public.packages (waybill, created_at desc);
