-- Persist ML analysis outputs on telemetry rows
alter table if exists public.telemetry
  add column if not exists predicted_power double precision,
  add column if not exists prediction_error double precision,
  add column if not exists error_percent double precision,
  add column if not exists is_anomaly boolean,
  add column if not exists anomaly_severity text,
  add column if not exists analyzed_at timestamptz;

create index if not exists telemetry_is_anomaly_idx on public.telemetry (is_anomaly);
create index if not exists telemetry_analyzed_at_idx on public.telemetry (analyzed_at);
