-- Migration 0003: Fix database logical issues
-- 1. Ensure faults table exists with correct schema (ML anomaly pipeline)
-- 2. Drop dead approval columns from missions
-- 3. Backfill inspection_results.panel_id from missions

-- ============================================================
-- 1. FAULTS TABLE — ensure it exists for the ML anomaly pipeline
-- ============================================================
create table if not exists public.faults (
    id          uuid primary key default gen_random_uuid(),
    panel_id    uuid not null references public.panels(id) on delete cascade,
    fault_type  text not null,
    confidence  double precision not null,
    detected_at timestamptz not null default now()
);

create index if not exists faults_panel_id_idx    on public.faults (panel_id);
create index if not exists faults_detected_at_idx on public.faults (detected_at);

-- Enable RLS (match other tables)
alter table public.faults enable row level security;

-- Allow authenticated users to read faults
create policy if not exists "Authenticated users can read faults"
    on public.faults for select
    to authenticated
    using (true);

-- Allow service role (backend) to insert faults
create policy if not exists "Service role can insert faults"
    on public.faults for insert
    to service_role
    with check (true);

-- ============================================================
-- 2. DROP DEAD APPROVAL COLUMNS FROM MISSIONS
-- ============================================================
alter table if exists public.missions
    drop column if exists approved_by_user_id,
    drop column if exists approved_at;

-- ============================================================
-- 3. BACKFILL inspection_results.panel_id FROM missions
--    Sets panel_id for any existing rows where it is NULL.
-- ============================================================
update public.inspection_results ir
set    panel_id = m.panel_id
from   public.missions m
where  ir.mission_id = m.id
  and  ir.panel_id is null;

-- Add index on inspection_results.panel_id for faster lookups
create index if not exists inspection_results_panel_id_idx
    on public.inspection_results (panel_id);
