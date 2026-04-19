export type Severity = 'LOW' | 'MED' | 'HIGH';
export type ModelType = 'ML' | 'CV';

const MIN_CONFIDENCE_BY_SEVERITY: Record<Severity, number> = {
  LOW: 0.5,
  MED: 0.7,
  HIGH: 0.85,
};

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(confidence, 1));
}

export function severityFromConfidence(confidence: number | null | undefined): Severity {
  const score = confidence == null || Number.isNaN(confidence) ? 0 : clampConfidence(confidence);

  if (score >= 0.85) return 'HIGH';
  if (score >= 0.7) return 'MED';
  return 'LOW';
}

export function severityFromMlFaultType(
  anomalyType: string | null | undefined
): Severity | null {
  const normalized = (anomalyType || '').toUpperCase();

  if (normalized.endsWith('_HIGH')) return 'HIGH';
  if (normalized.endsWith('_MEDIUM') || normalized.endsWith('_MED')) return 'MED';
  if (normalized.endsWith('_LOW')) return 'LOW';
  return null;
}

export function getAnomalySeverity(
  model: ModelType,
  anomalyType: string | null | undefined,
  confidence: number | null | undefined
): Severity {
  if (model === 'ML') {
    return severityFromMlFaultType(anomalyType) ?? severityFromConfidence(confidence);
  }

  return severityFromConfidence(confidence);
}

export function normalizeAnomalyConfidence(
  model: ModelType,
  anomalyType: string | null | undefined,
  confidence: number | null | undefined
): number | null {
  if (confidence == null || Number.isNaN(confidence)) {
    return null;
  }

  const normalizedConfidence = clampConfidence(confidence);

  if (model !== 'ML') {
    return normalizedConfidence;
  }

  const severity = severityFromMlFaultType(anomalyType);
  if (!severity) {
    return normalizedConfidence;
  }

  return Math.max(normalizedConfidence, MIN_CONFIDENCE_BY_SEVERITY[severity]);
}

export function formatAnomalyConfidence(confidence: number | null | undefined): string {
  if (confidence == null || Number.isNaN(confidence)) {
    return '-';
  }

  return `${Math.round(clampConfidence(confidence) * 100)}%`;
}
