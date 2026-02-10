import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface Telemetry {
  id: string;
  panel_id: string;
  voltage: number;
  current: number;
  temperature: number;
  timestamp: string;
  power?: number;
}

export interface TelemetryPrediction {
  timestamp: string;
  actual_power: number;
  predicted_power: number;
  error: number;
  error_percent: number;
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
    avg_error_percent: number;
  };
}

export interface Anomaly {
  timestamp: string;
  severity: 'high' | 'medium';
  error: number;
  error_percent: number;
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
      const response = await fetch(
        `${API_BASE_URL}/telemetry/predict?panel_id=${panelId}&limit=${limit}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get predictions');
      }

      return response.json();
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
      const response = await fetch(
        `${API_BASE_URL}/telemetry/anomalies?panel_id=${panelId}&threshold=${threshold}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to detect anomalies');
      }

      return response.json();
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
      const response = await fetch(
        `${API_BASE_URL}/telemetry/predict-next?panel_id=${panelId}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to predict next value');
      }

      return response.json();
    },
    enabled: !!panelId,
    refetchInterval: 1000 * 30, // Refresh every 30 seconds
  });
}

/**
 * Get latest telemetry for all panels (for dashboard charts)
 */
export function useLatestTelemetry(hours: number = 12) {
  return useQuery({
    queryKey: ['latest-telemetry', hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await (supabase as any)
        .from('telemetry')
        .select('*')
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return (data as Telemetry[]).map(t => ({
        ...t,
        power: t.voltage * t.current,
      }));
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
      const response = await fetch(`${API_BASE_URL}/telemetry/model-info`);

      if (!response.ok) {
        throw new Error('Failed to get model info');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });
}
