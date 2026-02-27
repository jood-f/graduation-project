import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { apiFetch } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface MLAnomaly {
  id: string;
  panel_id: string;
  panel_label: string;
  site_name: string;
  anomaly_type: string;
  severity: 'HIGH' | 'MED';
  actual_power: number;
  predicted_power: number | null;
  error: number | null;
  error_percent: number | null;
  timestamp: string;
  analyzed_at: string | null;
}

interface TelemetryMLRow {
  id: string;
  panel_id: string;
  voltage: number;
  current: number;
  timestamp: string;
  predicted_power: number | null;
  prediction_error: number | null;
  error_percent: number | null;
  anomaly_severity: string | null;
  analyzed_at: string | null;
  panels: {
    label: string | null;
    sites: { name: string } | null;
  } | null;
}

export function useMLAnomalies() {
  return useQuery({
    queryKey: ['ml-anomalies-persisted'],
    queryFn: async (): Promise<MLAnomaly[]> => {
      const { data, error } = await (supabase as any)
        .from('telemetry')
        .select(`
          id,
          panel_id,
          voltage,
          current,
          timestamp,
          predicted_power,
          prediction_error,
          error_percent,
          anomaly_severity,
          analyzed_at,
          panels (
            label,
            sites (name)
          )
        `)
        .eq('is_anomaly', true)
        .order('analyzed_at', { ascending: false })
        .order('timestamp', { ascending: false });

      if (error) throw error;

      return (data as TelemetryMLRow[]).map((row) => ({
        id: row.id,
        panel_id: row.panel_id,
        panel_label: row.panels?.label || 'Unknown',
        site_name: row.panels?.sites?.name || 'Unknown Site',
        anomaly_type: 'ML Power Deviation',
        severity: row.anomaly_severity === 'high' ? 'HIGH' : 'MED',
        actual_power: row.voltage * row.current,
        predicted_power: row.predicted_power,
        error: row.prediction_error,
        error_percent: row.error_percent,
        timestamp: row.timestamp,
        analyzed_at: row.analyzed_at,
      }));
    },
  });
}

interface RunScanInput {
  threshold?: number;
  hours?: number;
  batchSize?: number;
  onProgress?: (progress: RunScanProgress) => void;
}

export interface RunScanProgress {
  total_panels: number;
  scanned_panels: number;
  panels_with_results: number;
  anomalies_found: number;
  batches_processed: number;
}

interface RunScanResult {
  panels_scanned: number;
  panels_with_results: number;
  anomalies_found: number;
  total_panels: number;
  batches_processed: number;
}

export function useRunMLAnomalyScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threshold = 5,
      hours = 168,
      batchSize = 20,
      onProgress,
    }: RunScanInput = {}): Promise<RunScanResult> => {
      let offset = 0;
      let totalPanels = 0;
      let scannedPanels = 0;
      let panelsWithResults = 0;
      let anomaliesFound = 0;
      let batchesProcessed = 0;

      while (true) {
        const url = `${API_BASE_URL}/telemetry/anomalies/scan-all?threshold=${threshold}&hours=${hours}&batch_size=${batchSize}&offset=${offset}`;
        const response = await apiFetch(url, { method: 'POST' });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Failed to scan panels for ML anomalies');
        }

        const payload = await response.json();
        totalPanels = payload.total_panels ?? totalPanels;
        scannedPanels += payload.batch_count ?? 0;
        panelsWithResults += payload.panels_with_results_batch ?? 0;
        anomaliesFound += payload.anomalies_detected_batch ?? 0;
        batchesProcessed += 1;

        onProgress?.({
          total_panels: totalPanels,
          scanned_panels: scannedPanels,
          panels_with_results: panelsWithResults,
          anomalies_found: anomaliesFound,
          batches_processed: batchesProcessed,
        });

        if (payload.next_offset == null) {
          break;
        }

        offset = payload.next_offset;
      }

      return {
        total_panels: totalPanels,
        panels_scanned: scannedPanels,
        panels_with_results: panelsWithResults,
        anomalies_found: anomaliesFound,
        batches_processed: batchesProcessed,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-anomalies-persisted'] });
    },
  });
}
