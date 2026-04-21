import { describe, expect, it } from 'vitest';
import {
  formatAnomalyConfidence,
  getAnomalySeverity,
  normalizeAnomalyConfidence,
} from '@/lib/anomalySeverity';

describe('anomalySeverity', () => {
  it('keeps legacy ML high anomalies consistent on the page', () => {
    const confidence = normalizeAnomalyConfidence('ML', 'ML_POWER_ANOMALY_HIGH', 0.5);

    expect(confidence).toBe(0.85);
    expect(getAnomalySeverity('ML', 'ML_POWER_ANOMALY_HIGH', confidence)).toBe('HIGH');
    expect(formatAnomalyConfidence(confidence)).toBe('85%');
  });

  it('leaves CV confidence-driven severity unchanged', () => {
    const confidence = normalizeAnomalyConfidence('CV', 'HOTSPOT', 0.76);

    expect(confidence).toBe(0.76);
    expect(getAnomalySeverity('CV', 'HOTSPOT', confidence)).toBe('MED');
    expect(formatAnomalyConfidence(confidence)).toBe('76%');
  });
});
