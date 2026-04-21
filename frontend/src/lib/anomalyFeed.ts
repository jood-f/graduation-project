import {
  type ModelType,
  type Severity,
  formatAnomalyConfidence,
  getAnomalySeverity,
  normalizeAnomalyConfidence,
} from '@/lib/anomalySeverity';

export interface MlAnomalySourceRow {
  id: string;
  panel_id: string;
  fault_type: string;
  confidence: number | null;
  detected_at: string;
  panel_label?: string;
  site_name?: string;
}

export interface CvAnomalySourceRow {
  id: string;
  panel_id: string;
  defect_type: string;
  confidence: number | null;
  inspected_at: string;
  panel_label?: string;
  site_name?: string;
}

export interface DisplayAnomalyRow {
  id: string;
  panel_key: string;
  panel_label: string;
  site_name: string;
  anomaly_type: string;
  severity: Severity;
  model: ModelType;
  detected_at: string;
  detected_label: string;
  confidence: number | null;
  confidence_label: string;
  occurrence_count: number;
}

interface RawDisplayAnomalyRow extends DisplayAnomalyRow {
  dedupe_key: string;
  detected_time_ms: number;
}

function formatDetectedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildDedupeKey(row: Omit<RawDisplayAnomalyRow, 'dedupe_key' | 'detected_time_ms'>): string {
  return [
    row.model,
    row.site_name,
    row.panel_label,
    row.anomaly_type,
    row.severity,
    row.confidence_label,
    row.detected_at,
  ].join('::');
}

function createRawRow(
  model: ModelType,
  id: string,
  panelLabel: string | undefined,
  siteName: string | undefined,
  anomalyType: string,
  confidence: number | null,
  detectedAt: string
): RawDisplayAnomalyRow {
  const normalizedConfidence = normalizeAnomalyConfidence(model, anomalyType, confidence);
  const row: Omit<RawDisplayAnomalyRow, 'dedupe_key' | 'detected_time_ms'> = {
    id: `${model.toLowerCase()}-${id}`,
    panel_key: `${siteName || 'Unknown Site'}::${panelLabel || 'Unknown'}`,
    panel_label: panelLabel || 'Unknown',
    site_name: siteName || 'Unknown Site',
    anomaly_type: anomalyType,
    severity: getAnomalySeverity(model, anomalyType, normalizedConfidence),
    model,
    detected_at: detectedAt,
    detected_label: formatDetectedAt(detectedAt),
    confidence: normalizedConfidence,
    confidence_label: formatAnomalyConfidence(normalizedConfidence),
    occurrence_count: 1,
  };

  return {
    ...row,
    dedupe_key: buildDedupeKey(row),
    detected_time_ms: new Date(detectedAt).getTime() || 0,
  };
}

export function buildAnomalyFeed(
  mlRows: MlAnomalySourceRow[] | null | undefined,
  cvRows: CvAnomalySourceRow[] | null | undefined
): DisplayAnomalyRow[] {
  const rows: RawDisplayAnomalyRow[] = [
    ...(mlRows || []).map((row) =>
      createRawRow(
        'ML',
        row.id,
        row.panel_label,
        row.site_name,
        row.fault_type,
        row.confidence,
        row.detected_at
      )
    ),
    ...(cvRows || []).map((row) =>
      createRawRow(
        'CV',
        row.id,
        row.panel_label,
        row.site_name,
        row.defect_type,
        row.confidence,
        row.inspected_at
      )
    ),
  ];

  const collapsed = new Map<string, RawDisplayAnomalyRow>();

  rows.forEach((row) => {
    const existing = collapsed.get(row.dedupe_key);
    if (existing) {
      existing.occurrence_count += 1;
      return;
    }

    collapsed.set(row.dedupe_key, { ...row });
  });

  return Array.from(collapsed.values())
    .sort((a, b) => {
      if (b.detected_time_ms !== a.detected_time_ms) {
        return b.detected_time_ms - a.detected_time_ms;
      }

      if (b.occurrence_count !== a.occurrence_count) {
        return b.occurrence_count - a.occurrence_count;
      }

      return a.anomaly_type.localeCompare(b.anomaly_type);
    })
    .map(({ dedupe_key, detected_time_ms, ...row }) => row);
}
