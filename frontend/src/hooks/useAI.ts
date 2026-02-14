import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mockInspectionResults } from '@/data/mockData';
import { useInspectionStore } from '@/stores/inspectionStore';

export interface InspectionResult {
  id: string;
  mission_id: string;
  mission_image_id?: string | null;
  defect_type: 'CRACK' | 'DUST' | 'HOTSPOT' | 'SNOW' | 'HARDWARE_DAMAGE';
  confidence: number;
  bbox_x?: number;
  bbox_y?: number;
  bbox_width?: number;
  bbox_height?: number;
  description?: string | null;
  overall_condition?: 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL' | null;
  recommended_action?: string | null;
  created_at: string;
}

export function useInspectionResults(imageId: string | null) {
  return useQuery({
    queryKey: ['inspection-results', imageId],
    queryFn: async () => {
      if (!imageId) return [];
      const res = await fetch(`http://127.0.0.1:8000/api/v1/mission-images/${imageId}/results`);
      if (!res.ok) throw new Error('Failed to fetch inspection results');
      return await res.json();
    },
    enabled: !!imageId,
  });
}

function getOverallCondition(results: any[]): 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL' {
  if (results.length === 0) return 'GOOD';
  
  const maxConfidence = Math.max(...results.map(r => r.confidence));
  const criticalDefects = results.filter(r => r.defectType === 'HOTSPOT' || r.defectType === 'CRACK').length;
  
  if (criticalDefects > 1 || maxConfidence > 0.9) return 'CRITICAL';
  if (criticalDefects > 0 || maxConfidence > 0.8) return 'POOR';
  if (maxConfidence > 0.7) return 'FAIR';
  return 'GOOD';
}

function getRecommendedAction(results: any[]): string {
  if (results.length === 0) return 'Continue monitoring';
  
  const hasHotspots = results.some(r => r.defectType === 'HOTSPOT');
  const hasCracks = results.some(r => r.defectType === 'CRACK');
  const hasDust = results.some(r => r.defectType === 'DUST');
  
  if (hasHotspots && hasCracks) return 'Urgent: Replace panel - multiple critical defects detected';
  if (hasCracks) return 'High priority: Panel repair needed - structural damage detected';
  if (hasHotspots) return 'Schedule maintenance - thermal issues detected';
  if (hasDust) return 'Clean panel surface to restore efficiency';
  return 'Continue monitoring';
}

export function useCreateInspectionResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (results: Omit<InspectionResult, 'id' | 'created_at'>[]) => {
      // For now, just store in memory (until Supabase types are fixed)
      console.log('Creating inspection results:', results);
      
      // Add to store with unique IDs
      const resultsWithIds = results.map((r, i) => ({
        ...r,
        id: `${r.mission_id}-${Date.now()}-${i}`,
        created_at: new Date().toISOString(),
      }));
      
      useInspectionStore.addResults(resultsWithIds);
      console.log('[useAI] Results added to store:', resultsWithIds);
      toast.success(`AI detected ${results.length} defect(s)`);
      return resultsWithIds;
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        console.log('[useAI] Invalidating query for mission:', variables[0].mission_id);
        queryClient.invalidateQueries({ queryKey: ['inspection-results', variables[0].mission_id] });
      }
    },
    onError: (error) => {
      console.error('Error creating inspection results:', error);
      toast.error('Failed to save AI analysis results');
    },
  });
}

export interface TelemetryAnomaly {
  id: string;
  panel_id: string;
  panel_label: string;
  site_name: string;
  telemetry_data: {
    voltage: number;
    current: number;
    temperature: number;
    power: number;
  };
  anomaly_type: 'POWER_DROP' | 'OVERHEAT' | 'ML_FLAG' | 'OTHER';
  severity: 1 | 2 | 3 | 4 | 5;
  message: string;
  confidence: number;
  suggested_action: 'CREATE_ALERT' | 'TRIGGER_MISSION' | 'MONITOR' | 'NONE';
  created_at: string;
}

export function useTelemetryAnomalies() {
  return useQuery({
    queryKey: ['telemetry-anomalies'],
    queryFn: async () => {
      // Return empty for now (will use mock data from main anomalies)
      return [];
    },
  });
}
