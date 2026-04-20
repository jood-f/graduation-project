import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { apiGet } from '@/lib/api';

export interface Telemetry {
  id: string;
  panel_id: string;
  voltage: number;
  current: number;
  temperature: number;
  timestamp: string;
  power?: number;
}

export interface LatestTelemetryResult {
  telemetry: Telemetry[];
  isFallback: boolean;
  anchorTimestamp: string | null;
}

export type TelemetryPeriod = 'day' | 'week' | 'month';

export interface TelemetryPrediction {
  timestamp: string;
  actual_power: number;
  predicted_power: number;
  error: number;
  error_percent: number | null;
  voltage: number;
  current: number;
  temperature: number;
}

export interface PredictionResult {
  panel_id: string;
  total_predictions: number;
  predictions: TelemetryPrediction[];
  summary: {
    avg_error: number;
    max_error: number;
    avg_error_percent: number | null;
  };
}

export interface Anomaly {
  timestamp: string;
  severity: 'high' | 'medium';
  error: number;
  error_percent: number | null;
  actual_power: number;
  predicted_power: number;
  details: {
    voltage: number;
    current: number;
    temperature: number;
  };
}

export interface AnomalyResult {
  panel_id: string;
  threshold: number;
  anomalies: Anomaly[];
  total_anomalies: number;
}

const TELEMETRY_PERIOD_CONFIG: Record<TelemetryPeriod, { hours: number; fallbackLimit: number }> = {
  day: { hours: 24, fallbackLimit: 288 },
  week: { hours: 24 * 7, fallbackLimit: 1008 },
  month: { hours: 24 * 30, fallbackLimit: 4320 },
};

function buildTelemetryQuery(columns: string, panelId?: string) {
  let query = (supabase as any)
    .from('telemetry')
    .select(columns);

  if (panelId) {
    query = query.eq('panel_id', panelId);
  }

  return query;
}

/**
 * Fetch telemetry data from Supabase
 */
export function useTelemetry(panelId?: string) {
  return useQuery({
    queryKey: ['telemetry', panelId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('telemetry')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (panelId) {
        query = query.eq('panel_id', panelId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate power for each record
      return (data as Telemetry[]).map(t => ({
        ...t,
        power: t.voltage * t.current,
      }));
    },
  });
}

/**
 * Fetch ML power predictions from backend API
 */
export function usePredictions(panelId: string, limit: number = 100) {
  return useQuery({
    queryKey: ['predictions', panelId, limit],
    queryFn: async (): Promise<PredictionResult> => {
      return apiGet<PredictionResult>(
        `/telemetry/predict?panel_id=${panelId}&limit=${limit}`
      );
    },
    enabled: !!panelId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Fetch ML anomaly detection from backend API
 */
export function useAnomalies(panelId: string, threshold: number = 5.0) {
  return useQuery({
    queryKey: ['ml-anomalies', panelId, threshold],
    queryFn: async (): Promise<AnomalyResult> => {
      return apiGet<AnomalyResult>(
        `/telemetry/anomalies?panel_id=${panelId}&threshold=${threshold}`
      );
    },
    enabled: !!panelId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Predict next power output
 */
export function useNextPrediction(panelId: string) {
  return useQuery({
    queryKey: ['next-prediction', panelId],
    queryFn: async () => {
      return apiGet(`/telemetry/predict-next?panel_id=${panelId}`);
    },
    enabled: !!panelId,
    refetchInterval: 1000 * 30, // Refresh every 30 seconds
  });
}

/**
 * Get telemetry history for a selected panel and period.
 */
export function useLatestTelemetry(panelId?: string, period: TelemetryPeriod = 'day') {
  const { hours, fallbackLimit } = TELEMETRY_PERIOD_CONFIG[period];

  return useQuery({
    queryKey: ['latest-telemetry', panelId, period],
    enabled: !!panelId,
    queryFn: async (): Promise<LatestTelemetryResult> => {
      const MIN_POINTS_FOR_CHART = 2;
      const withPower = (rows: Telemetry[]) =>
        rows.map((t) => ({
          ...t,
          power: t.voltage * t.current,
        }));

      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await buildTelemetryQuery(
        'id,panel_id,voltage,current,temperature,timestamp',
        panelId
      )
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      const recentTelemetry = withPower(data as Telemetry[]);

      if (recentTelemetry.length >= MIN_POINTS_FOR_CHART) {
        return {
          telemetry: recentTelemetry,
          isFallback: false,
          anchorTimestamp: null,
        };
      }

      // No records in the last `hours`: fall back to a window ending at the latest available record.
      const { data: latestRow, error: latestError } = await buildTelemetryQuery(
        'timestamp',
        panelId
      )
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      if (!latestRow?.timestamp) {
        return {
          telemetry: [],
          isFallback: false,
          anchorTimestamp: null,
        };
      }

      const latestTimestamp = latestRow.timestamp as string;
      const fallbackSince = new Date(
        new Date(latestTimestamp).getTime() - hours * 60 * 60 * 1000
      ).toISOString();

      const { data: fallbackData, error: fallbackError } = await buildTelemetryQuery(
        'id,panel_id,voltage,current,temperature,timestamp',
        panelId
      )
        .gte('timestamp', fallbackSince)
        .lte('timestamp', latestTimestamp)
        .order('timestamp', { ascending: true });

      if (fallbackError) throw fallbackError;

      const fallbackTelemetry = withPower(fallbackData as Telemetry[]);
      if (fallbackTelemetry.length >= MIN_POINTS_FOR_CHART) {
        return {
          telemetry: fallbackTelemetry,
          isFallback: true,
          anchorTimestamp: latestTimestamp,
        };
      }

      // If data is very sparse, show the latest available history so the chart remains informative.
      const { data: extendedFallbackData, error: extendedFallbackError } = await buildTelemetryQuery(
        'id,panel_id,voltage,current,temperature,timestamp',
        panelId
      )
        .order('timestamp', { ascending: false })
        .limit(fallbackLimit);

      if (extendedFallbackError) throw extendedFallbackError;

      const extendedFallbackTelemetry = withPower(
        ((extendedFallbackData as Telemetry[]) || []).slice().reverse()
      );

      return {
        telemetry: extendedFallbackTelemetry.length > 0 ? extendedFallbackTelemetry : recentTelemetry,
        isFallback: true,
        anchorTimestamp: latestTimestamp,
      };
    },
    refetchInterval: 1000 * 60, // Refresh every minute
  });
}

/**
 * Get model info from backend
 */
export function useModelInfo() {
  return useQuery({
    queryKey: ['model-info'],
    queryFn: async () => {
      return apiGet('/telemetry/model-info');
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });
}
