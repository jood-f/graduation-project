// Simple in-memory store for inspection results
let inspectionResults: SavedInspectionResult[] = [];

export interface SavedInspectionResult {
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

export const useInspectionStore = {
  addResults: (newResults: SavedInspectionResult[]) => {
    inspectionResults = [...inspectionResults, ...newResults];
  },
  
  getResultsByMission: (missionId: string): SavedInspectionResult[] => {
    return inspectionResults.filter(r => r.mission_id === missionId);
  },
  
  clear: () => {
    inspectionResults = [];
  },
  
  getAll: () => {
    return inspectionResults;
  },
};
