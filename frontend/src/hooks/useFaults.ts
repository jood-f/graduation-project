import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface Fault {
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

export function useFaults() {
  return useQuery({
    queryKey: ['faults-cv-inspection-results'],
    queryFn: async () => {
      const response = await apiFetch(`${API_BASE_URL}/inspection-results/cv-anomalies`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch CV anomalies');
      }

      const rows = (await response.json()) as CVAnomalyRow[];

      return rows
        .filter((row) => row.panel_id)
        .map((row) => ({
          id: row.id,
          panel_id: row.panel_id as string,
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
        }))
        .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
    },
  });
}

export function useMissionFaults(missionId: string | null) {
  return useQuery({
    queryKey: ['mission-cv-faults', missionId],
    queryFn: async () => {
      if (!missionId) return [] as Fault[];

      const response = await apiFetch(
        `${API_BASE_URL}/inspection-results/cv-anomalies?mission_id=${encodeURIComponent(missionId)}`
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch mission CV anomalies');
      }

      const rows = (await response.json()) as CVAnomalyRow[];

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
