import { describe, expect, it } from 'vitest';
import { buildAnomalyFeed } from '@/lib/anomalyFeed';

describe('buildAnomalyFeed', () => {
  it('collapses visually identical anomaly rows into one display item', () => {
    const feed = buildAnomalyFeed(
      [
        {
          id: 'fault-1',
          panel_id: 'panel-a1',
          fault_type: 'ML_POWER_ANOMALY_HIGH',
          confidence: 0.85,
          detected_at: '2026-04-19T01:47:39Z',
          panel_label: 'Panel A1',
          site_name: 'KAU Solar Farm',
        },
        {
          id: 'fault-2',
          panel_id: 'panel-a1',
          fault_type: 'ML_POWER_ANOMALY_HIGH',
          confidence: 0.85,
          detected_at: '2026-04-19T01:47:39Z',
          panel_label: 'Panel A1',
          site_name: 'KAU Solar Farm',
        },
      ],
      []
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      anomaly_type: 'ML_POWER_ANOMALY_HIGH',
      model: 'ML',
      severity: 'HIGH',
      confidence_label: '85%',
      occurrence_count: 2,
      panel_key: 'KAU Solar Farm::Panel A1',
    });
  });

  it('keeps rows separate when the visible detected time changes', () => {
    const feed = buildAnomalyFeed(
      [
        {
          id: 'fault-1',
          panel_id: 'panel-a1',
          fault_type: 'ML_POWER_ANOMALY_HIGH',
          confidence: 0.85,
          detected_at: '2026-04-19T01:47:39Z',
          panel_label: 'Panel A1',
          site_name: 'KAU Solar Farm',
        },
      ],
      [
        {
          id: 'cv-1',
          panel_id: 'panel-a1',
          defect_type: 'Hotspot',
          confidence: 0.91,
          inspected_at: '2026-04-19T01:47:40Z',
          panel_label: 'Panel A1',
          site_name: 'KAU Solar Farm',
        },
      ]
    );

    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({
      anomaly_type: 'Hotspot',
      model: 'CV',
      confidence_label: '91%',
      occurrence_count: 1,
    });
    expect(feed[1]).toMatchObject({
      anomaly_type: 'ML_POWER_ANOMALY_HIGH',
      model: 'ML',
      occurrence_count: 1,
    });
  });
});
