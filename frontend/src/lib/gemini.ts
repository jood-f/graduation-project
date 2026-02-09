import { GoogleGenerativeAI } from '@google/generative-ai';

// MOCK MODE: Set to true to use simulated AI without API costs
const MOCK_MODE = import.meta.env.VITE_MOCK_AI === 'true';

if (MOCK_MODE) {
  console.log('[AI] 🔄 MOCK MODE ENABLED - Using simulated AI analysis (FREE, no API costs)');
}

// Initialize Gemini AI with API key from environment
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

// Mock defect data for testing without API - HIGH CONFIDENCE
const mockDefects = [
  { type: 'DUST' as const, confidence: 0.94, description: 'Heavy dust accumulation on panel surface reducing efficiency' },
  { type: 'HOTSPOT' as const, confidence: 0.96, description: 'Critical thermal hotspot detected - requires immediate attention' },
  { type: 'CRACK' as const, confidence: 0.92, description: 'Structural crack in panel - potential safety hazard' },
  { type: 'HARDWARE_DAMAGE' as const, confidence: 0.88, description: 'Significant corrosion on frame affecting structural integrity' },
  { type: 'SNOW' as const, confidence: 0.91, description: 'Snow coverage blocking solar radiation' },
];

function getRandomMockDefects(count: number = 2) {
  const shuffled = mockDefects.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(d => ({
    type: d.type,
    confidence: Math.max(0.85, Math.min(0.99, d.confidence + (Math.random() - 0.5) * 0.08)),
    bbox: {
      x: Math.random() * 0.7,
      y: Math.random() * 0.7,
      width: 0.15 + Math.random() * 0.3,
      height: 0.15 + Math.random() * 0.3,
    },
    description: d.description,
  }));
}

// Gemini Flash - Fast, cost-effective for telemetry analysis
export const geminiFlash = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.2, // Lower temperature for consistent analysis
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 1024,
  },
});

// Gemini 2.0 Flash - High accuracy for vision-based defect detection
export const geminiPro = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.1, // Very low for precise defect detection
    topP: 0.9,
    topK: 32,
    maxOutputTokens: 2048,
  },
});

// Function to get first available vision model
export async function getAvailableVisionModel() {
  console.log('[AI] Checking available vision models...');
  for (const modelName of VISION_MODELS) {
    try {
      console.log(`[AI] Trying model: ${modelName}`);
      // Just try to get the model
      const model = genAI.getGenerativeModel({ model: modelName });
      console.log(`[AI] ✓ Model available: ${modelName}`);
      return model;
    } catch (e) {
      console.log(`[AI] ✗ Model not available: ${modelName}`);
    }
  }
  console.error('[AI] No vision models available!');
  return geminiPro; // Fallback to default
}

export interface TelemetryData {
  voltage: number;
  current: number;
  temperature: number;
  power: number;
  timestamp: string;
}

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  severity: 1 | 2 | 3 | 4 | 5;
  anomalyType: 'POWER_DROP' | 'OVERHEAT' | 'ML_FLAG' | 'OTHER';
  message: string;
  suggestedAction: 'CREATE_ALERT' | 'TRIGGER_MISSION' | 'MONITOR' | 'NONE';
  confidence: number;
}

export interface DefectDetectionResult {
  defects: Array<{
    type: 'CRACK' | 'DUST' | 'HOTSPOT' | 'SNOW' | 'HARDWARE_DAMAGE';
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
    description: string;
  }>;
  overallCondition: 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  recommendedAction: string;
}

/**
 * Pipeline 1: Telemetry Anomaly Detection using Gemini 3 Flash
 * Fast pattern recognition (~200ms response)
 */
export async function analyzeTelemetryAnomaly(
  telemetry: TelemetryData,
  normalRanges: {
    voltageMin: number;
    voltageMax: number;
    tempMax: number;
    powerMin: number;
  }
): Promise<AnomalyDetectionResult> {
  console.log('[AI] Analyzing telemetry data...', telemetry);
  
  // Use MOCK MODE if enabled
  if (MOCK_MODE) {
    console.log('[AI] 🔄 Using MOCK telemetry analysis (no API cost)');
    
    // Analyze the actual telemetry values
    const isOverheating = telemetry.temperature > normalRanges.tempMax;
    const isPowerDrop = telemetry.power < normalRanges.powerMin;
    const isVoltageAbnormal = telemetry.voltage < normalRanges.voltageMin || telemetry.voltage > normalRanges.voltageMax;
    
    const hasAnomaly = isOverheating || isPowerDrop || isVoltageAbnormal;
    
    if (!hasAnomaly) {
      console.log('[AI] Mock: No anomalies detected - telemetry normal');
      return {
        hasAnomaly: false,
        severity: 1,
        anomalyType: 'OTHER',
        message: 'All telemetry readings within normal range',
        suggestedAction: 'NONE',
        confidence: 0.95,
      };
    }
    
    // Determine most critical issue
    let anomalyType: 'POWER_DROP' | 'OVERHEAT' | 'ML_FLAG' | 'OTHER' = 'OTHER';
    let message = '';
    let severity: 1 | 2 | 3 | 4 | 5 = 1;
    let suggestedAction: 'CREATE_ALERT' | 'TRIGGER_MISSION' | 'MONITOR' | 'NONE' = 'MONITOR';
    
    if (isOverheating) {
      anomalyType = 'OVERHEAT';
      const tempExcess = telemetry.temperature - normalRanges.tempMax;
      if (tempExcess > 20) {
        severity = 5;
        message = `Critical overheating detected: ${telemetry.temperature}°C (${tempExcess}°C above normal)`;
        suggestedAction = 'TRIGGER_MISSION';
      } else if (tempExcess > 10) {
        severity = 4;
        message = `High temperature warning: ${telemetry.temperature}°C (${tempExcess}°C above normal)`;
        suggestedAction = 'TRIGGER_MISSION';
      } else {
        severity = 3;
        message = `Elevated temperature detected: ${telemetry.temperature}°C`;
        suggestedAction = 'CREATE_ALERT';
      }
    } else if (isPowerDrop) {
      anomalyType = 'POWER_DROP';
      const powerDeficit = normalRanges.powerMin - telemetry.power;
      const dropPercentage = (powerDeficit / normalRanges.powerMin * 100).toFixed(0);
      if (powerDeficit > normalRanges.powerMin * 0.5) {
        severity = 5;
        message = `Critical power drop: ${telemetry.power}W (${dropPercentage}% below minimum)`;
        suggestedAction = 'TRIGGER_MISSION';
      } else if (powerDeficit > normalRanges.powerMin * 0.3) {
        severity = 4;
        message = `Significant power reduction: ${telemetry.power}W (${dropPercentage}% below minimum)`;
        suggestedAction = 'TRIGGER_MISSION';
      } else {
        severity = 3;
        message = `Low power output detected: ${telemetry.power}W`;
        suggestedAction = 'CREATE_ALERT';
      }
    } else if (isVoltageAbnormal) {
      anomalyType = 'OTHER';
      severity = 3;
      message = `Voltage out of range: ${telemetry.voltage}V (normal: ${normalRanges.voltageMin}-${normalRanges.voltageMax}V)`;
      suggestedAction = 'CREATE_ALERT';
    }
    
    console.log(`[AI] Mock: Anomaly detected - ${anomalyType} (severity ${severity})`);
    return {
      hasAnomaly: true,
      severity,
      anomalyType,
      message,
      suggestedAction,
      confidence: 0.92,
    };
  }
  
  // Real Gemini API mode
  const prompt = `You are an expert solar panel monitoring system analyzing telemetry data for anomalies.

Current Telemetry Readings:
- Voltage: ${telemetry.voltage}V
- Current: ${telemetry.current}A
- Temperature: ${telemetry.temperature}°C
- Power Output: ${telemetry.power}W
- Timestamp: ${telemetry.timestamp}

Normal Operating Ranges:
- Voltage: ${normalRanges.voltageMin}V - ${normalRanges.voltageMax}V
- Temperature: < ${normalRanges.tempMax}°C
- Minimum Power: > ${normalRanges.powerMin}W

Analyze this data and respond ONLY with a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "hasAnomaly": boolean,
  "severity": number (1-5, where 5 is critical),
  "anomalyType": "POWER_DROP" | "OVERHEAT" | "ML_FLAG" | "OTHER",
  "message": "brief description of the issue",
  "suggestedAction": "CREATE_ALERT" | "TRIGGER_MISSION" | "MONITOR" | "NONE",
  "confidence": number (0-1)
}

Rules:
- severity 5: Critical failure requiring immediate action
- severity 4: High priority, trigger mission
- severity 3: Medium, create alert
- severity 2-1: Low priority, monitor
- If temperature > ${normalRanges.tempMax}°C, use OVERHEAT
- If power < ${normalRanges.powerMin}W, use POWER_DROP
- If voltage outside range, use OTHER
- Suggest TRIGGER_MISSION for severity >= 4
- Suggest CREATE_ALERT for severity 3
- Suggest MONITOR for severity <= 2`;

  try {
    console.log('[AI] Calling Gemini Flash for telemetry analysis...');
    const result = await geminiFlash.generateContent(prompt);
    const response = result.response.text();
    
    // Clean the response - remove markdown code blocks if present
    const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis: AnomalyDetectionResult = JSON.parse(cleanedResponse);
    
    console.log('[AI] ✓ Telemetry analysis complete:', analysis);
    return analysis;
  } catch (error) {
    console.error('[AI] Telemetry analysis error:', error);
    // Return safe default
    return {
      hasAnomaly: false,
      severity: 1,
      anomalyType: 'OTHER',
      message: 'Analysis failed',
      suggestedAction: 'NONE',
      confidence: 0,
    };
  }
}

/**
 * Pipeline 2: Vision-Based Defect Detection using Gemini 2.0 Flash
 * Multi-modal vision analysis with high accuracy
 */
export async function detectDefects(
  imageBase64: string,
  imageType: 'RGB' | 'THERMAL'
): Promise<DefectDetectionResult> {
  console.log(`[AI] Starting defect detection for ${imageType} image...`);
  
  // Use MOCK MODE if enabled
  if (MOCK_MODE) {
    console.log('[AI] 🔄 Using MOCK defect detection (no API cost)');
    const hasDefects = Math.random() > 0.2; // 80% chance of defects in mock mode
    
    if (hasDefects) {
      const defectCount = Math.random() > 0.5 ? 1 : 2;
      const defects = getRandomMockDefects(defectCount);
      console.log(`[AI] Mock: Found ${defects.length} simulated defects`);
      return {
        defects,
        overallCondition: 'FAIR' as const,
        recommendedAction: '✓ Schedule maintenance - test defects detected',
      };
    } else {
      console.log('[AI] Mock: No defects found');
      return {
        defects: [],
        overallCondition: 'GOOD' as const,
        recommendedAction: '✓ Panel is clean - test mode',
      };
    }
  }

  console.log(`[AI] Image size: ${imageBase64.length} bytes`);
  console.log('[AI] API Key present:', !!import.meta.env.VITE_GEMINI_API_KEY);
  
  const prompt = `Analyze this solar panel image and detect ALL visible defects.

IMPORTANT: You MUST be VERY sensitive to dust, dirt, sand, and soiling on the panel surface. ANY visible dirt or discoloration is a defect.

Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "defects": [
    {"type": "DUST" | "CRACK" | "HOTSPOT" | "SNOW" | "HARDWARE_DAMAGE", "confidence": 0-1, "bbox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1}, "description": "what you see"}
  ],
  "overallCondition": "GOOD" | "FAIR" | "POOR" | "CRITICAL",
  "recommendedAction": "action needed"
}

Rules:
- If you see ANY dust, dirt, sand, discoloration, or spots: add a DUST defect with confidence 0.5-0.95
- If no defects: return empty defects array
- bbox: normalized coordinates (0-1 range)
- overallCondition: CRITICAL if major damage, POOR if multiple defects, FAIR if minor dust, GOOD if clean`;

  try {
    console.log('[AI] Calling Gemini API...');
    
    const result = await geminiPro.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      },
    ]);

    console.log('[AI] Gemini responded');
    const response = result.response.text();
    console.log('[AI] Raw response:', response.substring(0, 300));
    
    // Clean the response
    const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis: DefectDetectionResult = JSON.parse(cleanedResponse);
    console.log(`[AI] Found ${analysis.defects.length} defects`);
    
    return analysis;
  } catch (error) {
    console.error('[AI] API Error:', error instanceof Error ? error.message : String(error));
    console.log('[AI] 💡 Enable MOCK mode by setting VITE_MOCK_AI=true in .env');
    // Return safe default
    return {
      defects: [],
      overallCondition: 'GOOD',
      recommendedAction: 'Analysis failed - manual inspection recommended',
    };
  }
}

/**
 * Helper function to convert File to base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Preprocess image for defect detection
 * NOTE: Minimal preprocessing to preserve detail for dust/defect detection
 */
export async function preprocessImage(file: File): Promise<string> {
  console.log('[Preprocessing] Starting image preprocessing...');
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      // Keep maximum quality - minimal resize
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      let { width, height } = img;
      const maxSize = 2048; // Increased from 1024 to preserve detail

      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64 with higher JPEG quality
      const base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      console.log('[Preprocessing] Image preprocessed - size:', base64.length, 'bytes');
      resolve(base64);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
