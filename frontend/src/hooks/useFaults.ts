import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { apiFetch } from '@/lib/api';

const LIVE_ANOMALY_REFETCH_MS = 5000;

function useRealtimeTableInvalidation(queryKey: readonly string[], table: string) {
  const queryClient = useQueryClient();
  const queryKeySignature = queryKey.join(':');
  const stableQueryKey = useMemo(
    () => (queryKeySignature ? queryKeySignature.split(':') : []),
    [queryKeySignature]
  );

  useEffect(() => {
    const channel = (supabase as any)
      .channel(`realtime:${table}:${queryKeySignature}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          void queryClient.invalidateQueries({ queryKey: stableQueryKey });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, queryKeySignature, stableQueryKey, table]);
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';

  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json() as { detail?: unknown; message?: unknown };
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return payload.detail;
      }
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
      return JSON.stringify(payload);
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  const text = await response.text();
  return text || `Request failed (${response.status})`;
}

export interface Fault {
  id: string;
  panel_id: string;
  fault_type: string;
  confidence: number;
  detected_at: string;
  panel_label?: string;
  site_name?: string;
}

interface FaultRow {
  id: string;
  panel_id: string;
  fault_type: string;
  confidence: number;
  detected_at: string;
  panels: {
    label: string | null;
    sites: { name: string } | null;
  } | null;
}

export function useFaults() {
  useRealtimeTableInvalidation(['faults'], 'faults');

  return useQuery({
    queryKey: ['faults'],
    queryFn: async (): Promise<Fault[]> => {
      const { data, error } = await (supabase as any)
        .from('faults')
        .select(`
          id,
          panel_id,
          fault_type,
          confidence,
          detected_at,
          panels (
            label,
            sites (name)
          )
        `)
        .order('detected_at', { ascending: false });

      if (error) throw error;

      return (data as FaultRow[]).map((row) => ({
        id: row.id,
        panel_id: row.panel_id,
        fault_type: row.fault_type,
        confidence: row.confidence,
        detected_at: row.detected_at,
        panel_label: row.panels?.label || 'Unknown',
        site_name: row.panels?.sites?.name || 'Unknown Site',
      }));
    },
    refetchInterval: LIVE_ANOMALY_REFETCH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export interface MissionFault {
  id: string;
  panel_id: string;
  fault_type: string;
  confidence: number;
  detected_at: string;
  mission_id?: string;
  mission_image_id?: string | null;
  bbox?: { x?: number; y?: number; width?: number; height?: number } | null;
  status?: string;
  storage_path?: string | null;
  model_version?: string | null;
  panel_label?: string;
  site_name?: string;
}

interface CVAnomalyRow {
  id: string;
  mission_id: string;
  mission_image_id: string | null;
  panel_id: string | null;
  panel_label: string | null;
  site_name: string | null;
  fault_type: string | null;
  confidence: number | null;
  status: string;
  bbox: { x?: number; y?: number; width?: number; height?: number } | null;
  detected_at: string | null;
  storage_path: string | null;
  model_version: string | null;
}

export function useMissionFaults(missionId: string | null) {
  return useQuery({
    queryKey: ['mission-cv-faults', missionId],
    queryFn: async (): Promise<MissionFault[]> => {
      if (!missionId) return [];

      const response = await apiFetch(
        `/inspection-results/cv-anomalies?mission_id=${encodeURIComponent(missionId)}`
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Mission CV anomalies response was not a list');
      }

      const rows = payload as CVAnomalyRow[];

      return rows.map((row) => ({
        id: row.id,
        panel_id: row.panel_id || '',
        fault_type: row.fault_type || 'Unknown Defect',
        confidence: row.confidence ?? 0,
        detected_at: row.detected_at || new Date().toISOString(),
        mission_id: row.mission_id,
        mission_image_id: row.mission_image_id,
        bbox: row.bbox,
        status: row.status,
        storage_path: row.storage_path,
        model_version: row.model_version,
        panel_label: row.panel_label || 'Unknown',
        site_name: row.site_name || 'Unknown Site',
      }));
    },
    enabled: !!missionId,
  });
}

/* ─── CV anomalies from inspection_results table ─── */

export interface CVAnomaly {
  id: string;
  panel_id: string;
  defect_type: string;
  confidence: number;
  inspected_at: string;
  panel_label?: string;
  site_name?: string;
  model_version?: string | null;
}

interface InspectionResultRow {
  id: string;
  panel_id: string | null;
  defect_type: string | null;
  confidence: number | null;
  inspected_at: string;
  model_version: string | null;
  panels: {
    label: string | null;
    sites: { name: string } | null;
  } | null;
}

export function useCVAnomalies() {
  useRealtimeTableInvalidation(['cv-anomalies'], 'inspection_results');

  return useQuery({
    queryKey: ['cv-anomalies'],
    queryFn: async (): Promise<CVAnomaly[]> => {
      const { data, error } = await (supabase as any)
        .from('inspection_results')
        .select(`
          id,
          panel_id,
          defect_type,
          confidence,
          inspected_at,
          model_version,
          panels (
            label,
            sites (name)
          )
        `)
        .eq('status', 'FAIL')
        .order('inspected_at', { ascending: false });

      if (error) throw error;

      return (data as InspectionResultRow[])
        .filter((row) => row.panel_id)
        .map((row) => ({
          id: row.id,
          panel_id: row.panel_id as string,
          defect_type: row.defect_type || 'Unknown Defect',
          confidence: row.confidence ?? 0,
          inspected_at: row.inspected_at,
          panel_label: row.panels?.label || 'Unknown',
          site_name: row.panels?.sites?.name || 'Unknown Site',
          model_version: row.model_version,
        }));
    },
    refetchInterval: LIVE_ANOMALY_REFETCH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}
