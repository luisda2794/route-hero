-- Cross-device storage for "Bloques de enrutamiento". `blocks` holds the
-- immutable zone structure computed once at creation (only `name` changes
-- after that, via a rename); `scan_marks`/`delivery_marks` hold the
-- frequently-changing per-waybill state as individual rows instead of a
-- whole-block blob, so two devices marking different (or even the same)
-- waybill at once never clobber each other's unrelated changes.
create table public.blocks (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  groups jsonb not null,
  pudo_group jsonb
);

create index blocks_created_at_idx on public.blocks (created_at desc);

create table public.scan_marks (
  block_id uuid not null references public.blocks (id) on delete cascade,
  waybill text not null,
  scanned_at timestamptz not null,
  primary key (block_id, waybill)
);

create table public.delivery_marks (
  block_id uuid not null references public.blocks (id) on delete cascade,
  waybill text not null,
  status text not null check (status in ('delivered', 'failed')),
  marked_at timestamptz not null,
  primary key (block_id, waybill)
);

-- Same pattern as sessions/packages: RLS on, no policies — every device
-- reads and writes exclusively through the blocks-* edge functions (service
-- role key), so the public anon key alone can never list, read, or modify
-- these tables directly.
alter table public.blocks enable row level security;
alter table public.scan_marks enable row level security;
alter table public.delivery_marks enable row level security;
