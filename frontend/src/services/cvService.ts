/**
 * CV Analysis Service
 * Calls the YOLOv8 backend API for solar panel defect detection
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface DetectionResult {
  inspection_id: string;
  class_name: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  status: 'PASS' | 'FAIL' | 'REVIEW';
}

export interface AnalysisResponse {
  image_id: string;
  storage_path: string;
  detections: DetectionResult[];
  total_detections: number;
}

/**
 * Analyze a mission image using the YOLOv8 CV model
 * @param imageId - The UUID of the mission image to analyze
 * @param confidenceThreshold - Minimum confidence threshold (0-1)
 * @returns Analysis results with detections
 */
export async function analyzeImage(
  imageId: string, 
  confidenceThreshold: number = 0.5
): Promise<AnalysisResponse> {
  const response = await fetch(
    `${API_BASE_URL}/mission-images/${imageId}/analyze?confidence_threshold=${confidenceThreshold}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Analysis failed: ${errorText}`);
  }

  return response.json();
}

/**
 * Get existing analysis results for a mission image
 * @param imageId - The UUID of the mission image
 * @returns List of previous detection results
 */
export async function getImageResults(imageId: string): Promise<DetectionResult[]> {
  const response = await fetch(
    `${API_BASE_URL}/mission-images/${imageId}/results`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get results: ${errorText}`);
  }

  return response.json();
}

/**
 * Check if the CV model is available on the backend
 * @returns True if model is ready
 */
export async function checkModelAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/cv/status`);
    if (response.ok) {
      const data = await response.json();
      return data.available === true;
    }
    return false;
  } catch {
    return false;
  }
}
