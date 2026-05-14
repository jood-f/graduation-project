-- Track whether an inspection was created manually by an operator or
-- automatically from telemetry anomaly detection.

alter table if exists public.missions
  add column if not exists source text;

alter table if exists public.missions
  alter column source set default 'MANUAL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'missions_source_check'
      and conrelid = 'public.missions'::regclass
  ) then
    alter table public.missions
      add constraint missions_source_check
      check (source is null or source in ('MANUAL', 'AUTOMATED'));
  end if;
end $$;
