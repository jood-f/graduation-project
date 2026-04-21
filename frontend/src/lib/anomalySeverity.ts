export type Severity = 'LOW' | 'MED' | 'HIGH';
export type ModelType = 'ML' | 'CV';

export interface SeverityExplanation {
  title: string;
  description: string;
  recommendation: string;
}

const MIN_CONFIDENCE_BY_SEVERITY: Record<Severity, number> = {
  LOW: 0.5,
  MED: 0.7,
  HIGH: 0.85,
};

const SEVERITY_EXPLANATIONS: Record<Severity, SeverityExplanation> = {
  LOW: {
    title: 'Low severity',
    description: 'The system sees a weak anomaly signal or a lower-priority issue.',
    recommendation: 'Keep monitoring it and check it during routine inspection.',
  },
  MED: {
    title: 'Medium severity',
    description: 'The anomaly looks meaningful and should be reviewed soon.',
    recommendation: 'Plan a targeted inspection before it grows into a bigger fault.',
  },
  HIGH: {
    title: 'High severity',
    description: 'The anomaly signal is strong and more likely to affect panel performance.',
    recommendation: 'Prioritize this panel for inspection as soon as possible.',
  },
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

export function getSeverityExplanation(severity: Severity): SeverityExplanation {
  return SEVERITY_EXPLANATIONS[severity];
}
