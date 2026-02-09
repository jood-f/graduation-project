import type { 
  User, Site, Panel, Telemetry, Anomaly, Mission, 
  MissionImage, InspectionResult, DashboardStats 
} from '@/types';

export const mockUser: User = {
  id: 'user-001',
  email: 'john.operator@solarsense.com',
  name: 'John Anderson',
  role: 'operator',
  avatar: undefined,
  createdAt: '2024-01-15T10:00:00Z',
};

export const mockSites: Site[] = [
  { id: 'site-001', name: 'Desert Sun Farm', locationLat: 33.4484, locationLng: -112.0740, createdAt: '2023-06-01T00:00:00Z' },
  { id: 'site-002', name: 'Valley Solar Park', locationLat: 34.0522, locationLng: -118.2437, createdAt: '2023-08-15T00:00:00Z' },
  { id: 'site-003', name: 'Mountain Ridge Array', locationLat: 39.7392, locationLng: -104.9903, createdAt: '2024-02-01T00:00:00Z' },
];

export const mockPanels: Panel[] = [
  { id: 'panel-001', siteId: 'site-001', siteName: 'Desert Sun Farm', label: 'A1-001', serialNumber: 'SN-DSF-001', installedAt: '2023-06-15T00:00:00Z', status: 'OK' },
  { id: 'panel-002', siteId: 'site-001', siteName: 'Desert Sun Farm', label: 'A1-002', serialNumber: 'SN-DSF-002', installedAt: '2023-06-15T00:00:00Z', status: 'OK' },
  { id: 'panel-003', siteId: 'site-001', siteName: 'Desert Sun Farm', label: 'A1-003', serialNumber: 'SN-DSF-003', installedAt: '2023-06-15T00:00:00Z', status: 'WARNING' },
  { id: 'panel-004', siteId: 'site-001', siteName: 'Desert Sun Farm', label: 'A2-001', serialNumber: 'SN-DSF-004', installedAt: '2023-06-16T00:00:00Z', status: 'OK' },
  { id: 'panel-005', siteId: 'site-001', siteName: 'Desert Sun Farm', label: 'A2-002', serialNumber: 'SN-DSF-005', installedAt: '2023-06-16T00:00:00Z', status: 'FAULT' },
  { id: 'panel-006', siteId: 'site-002', siteName: 'Valley Solar Park', label: 'B1-001', serialNumber: 'SN-VSP-001', installedAt: '2023-09-01T00:00:00Z', status: 'OK' },
  { id: 'panel-007', siteId: 'site-002', siteName: 'Valley Solar Park', label: 'B1-002', serialNumber: 'SN-VSP-002', installedAt: '2023-09-01T00:00:00Z', status: 'OK' },
  { id: 'panel-008', siteId: 'site-002', siteName: 'Valley Solar Park', label: 'B2-001', serialNumber: 'SN-VSP-003', installedAt: '2023-09-02T00:00:00Z', status: 'WARNING' },
  { id: 'panel-009', siteId: 'site-003', siteName: 'Mountain Ridge Array', label: 'C1-001', serialNumber: 'SN-MRA-001', installedAt: '2024-02-15T00:00:00Z', status: 'OK' },
  { id: 'panel-010', siteId: 'site-003', siteName: 'Mountain Ridge Array', label: 'C1-002', serialNumber: 'SN-MRA-002', installedAt: '2024-02-15T00:00:00Z', status: 'OK' },
];

function generateTelemetry(panelId: string, hoursBack: number = 24): Telemetry[] {
  const data: Telemetry[] = [];
  const now = new Date();
  
  for (let i = hoursBack; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = ts.getHours();
    const isDaytime = hour >= 6 && hour <= 18;
    const peakMultiplier = isDaytime ? Math.sin((hour - 6) * Math.PI / 12) : 0;
    
    data.push({
      id: `tel-${panelId}-${i}`,
      panelId,
      ts: ts.toISOString(),
      voltage: isDaytime ? 35 + Math.random() * 5 + peakMultiplier * 3 : 0,
      current: isDaytime ? 8 + Math.random() * 2 + peakMultiplier * 2 : 0,
      temperature: 25 + Math.random() * 15 + peakMultiplier * 10,
      irradiance: isDaytime ? 200 + peakMultiplier * 800 + Math.random() * 100 : 0,
      acPower: isDaytime ? 250 + peakMultiplier * 200 + Math.random() * 30 : 0,
      dcPower: isDaytime ? 280 + peakMultiplier * 220 + Math.random() * 35 : 0,
    });
  }
  
  return data;
}

export const mockTelemetry: Record<string, Telemetry[]> = {
  'panel-001': generateTelemetry('panel-001'),
  'panel-002': generateTelemetry('panel-002'),
  'panel-003': generateTelemetry('panel-003'),
  'panel-004': generateTelemetry('panel-004'),
  'panel-005': generateTelemetry('panel-005'),
};

export const mockAnomalies: Anomaly[] = [
  {
    id: 'anom-001',
    panelId: 'panel-003',
    panelLabel: 'A1-003',
    siteName: 'Desert Sun Farm',
    ts: '2026-01-17T08:30:00Z',
    type: 'POWER_DROP',
    severity: 'MED',
    source: 'BACKEND_RULE',
    status: 'OPEN',
    message: 'Power output dropped 25% below expected baseline',
  },
  {
    id: 'anom-002',
    panelId: 'panel-005',
    panelLabel: 'A2-002',
    siteName: 'Desert Sun Farm',
    ts: '2026-01-17T06:15:00Z',
    type: 'OVERHEAT',
    severity: 'HIGH',
    source: 'ON_DEVICE_ML',
    status: 'OPEN',
    message: 'Temperature exceeded 85°C threshold for 10 minutes',
  },
  {
    id: 'anom-003',
    panelId: 'panel-008',
    panelLabel: 'B2-001',
    siteName: 'Valley Solar Park',
    ts: '2026-01-16T14:45:00Z',
    type: 'ML_FLAG',
    severity: 'LOW',
    source: 'ON_DEVICE_ML',
    status: 'ACKED',
    message: 'Potential dust accumulation detected via image analysis',
  },
  {
    id: 'anom-004',
    panelId: 'panel-001',
    panelLabel: 'A1-001',
    siteName: 'Desert Sun Farm',
    ts: '2026-01-15T11:20:00Z',
    type: 'OTHER',
    severity: 'LOW',
    source: 'BACKEND_RULE',
    status: 'CLOSED',
    message: 'Intermittent voltage fluctuation detected',
  },
];

export const mockMissions: Mission[] = [
  {
    id: 'mission-001',
    panelId: 'panel-005',
    panelLabel: 'A2-002',
    siteName: 'Desert Sun Farm',
    status: 'PENDING_APPROVAL',
    createdAt: '2026-01-17T07:00:00Z',
  },
  {
    id: 'mission-002',
    panelId: 'panel-003',
    panelLabel: 'A1-003',
    siteName: 'Desert Sun Farm',
    status: 'APPROVED',
    approvedByUserId: 'user-drone-001',
    approvedByName: 'Sarah Chen',
    approvedAt: '2026-01-16T15:30:00Z',
    createdAt: '2026-01-16T10:00:00Z',
  },
  {
    id: 'mission-003',
    panelId: 'panel-008',
    panelLabel: 'B2-001',
    siteName: 'Valley Solar Park',
    status: 'COMPLETED',
    approvedByUserId: 'user-drone-002',
    approvedByName: 'Mike Torres',
    approvedAt: '2026-01-14T09:00:00Z',
    createdAt: '2026-01-13T16:00:00Z',
  },
  {
    id: 'mission-004',
    panelId: 'panel-001',
    panelLabel: 'A1-001',
    siteName: 'Desert Sun Farm',
    status: 'IN_FLIGHT',
    approvedByUserId: 'user-drone-001',
    approvedByName: 'Sarah Chen',
    approvedAt: '2026-01-17T08:00:00Z',
    createdAt: '2026-01-17T06:30:00Z',
  },
];

export const mockMissionImages: MissionImage[] = [
  {
    id: 'img-001',
    missionId: 'mission-003',
    storageKey: 'missions/mission-003/img-001.jpg',
    contentType: 'image/jpeg',
    width: 1920,
    height: 1080,
    uploadedAt: '2026-01-14T11:00:00Z',
    url: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800',
  },
  {
    id: 'img-002',
    missionId: 'mission-003',
    storageKey: 'missions/mission-003/img-002.jpg',
    contentType: 'image/jpeg',
    width: 1920,
    height: 1080,
    uploadedAt: '2026-01-14T11:05:00Z',
    url: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=800',
  },
];

export const mockInspectionResults: InspectionResult[] = [
  {
    id: 'insp-001',
    missionId: 'mission-003',
    defectType: 'DUST',
    confidence: 0.87,
    bbox: { x: 0.25, y: 0.15, width: 0.35, height: 0.25 },
    notes: 'Moderate dust accumulation on panel surface - cleaning recommended',
    createdAt: '2026-01-14T11:30:00Z',
  },
  {
    id: 'insp-002',
    missionId: 'mission-003',
    defectType: 'HOTSPOT',
    confidence: 0.72,
    bbox: { x: 0.65, y: 0.35, width: 0.15, height: 0.12 },
    notes: 'Potential hotspot detected in cell region - monitor closely',
    createdAt: '2026-01-14T11:30:00Z',
  },
  {
    id: 'insp-003',
    missionId: 'mission-004',
    defectType: 'CRACK',
    confidence: 0.91,
    bbox: { x: 0.45, y: 0.50, width: 0.20, height: 0.08 },
    notes: 'Micro-crack detected in glass coating - high confidence',
    createdAt: '2026-01-17T08:45:00Z',
  },
  {
    id: 'insp-004',
    missionId: 'mission-004',
    defectType: 'DUST',
    confidence: 0.65,
    bbox: { x: 0.15, y: 0.20, width: 0.25, height: 0.30 },
    notes: 'Dust and dirt accumulation on lower panel section',
    createdAt: '2026-01-17T08:45:00Z',
  },
  {
    id: 'insp-005',
    missionId: 'mission-002',
    defectType: 'HOTSPOT',
    confidence: 0.85,
    bbox: { x: 0.55, y: 0.40, width: 0.18, height: 0.15 },
    notes: 'Significant hotspot - thermal imaging shows 15°C above baseline',
    createdAt: '2026-01-16T16:00:00Z',
  },
  {
    id: 'insp-006',
    missionId: 'mission-002',
    defectType: 'HARDWARE_DAMAGE',
    confidence: 0.78,
    bbox: { x: 0.85, y: 0.10, width: 0.12, height: 0.15 },
    notes: 'Junction box shows signs of corrosion and weathering',
    createdAt: '2026-01-16T16:00:00Z',
  },
  {
    id: 'insp-007',
    missionId: 'mission-003',
    defectType: 'SNOW',
    confidence: 0.45,
    bbox: { x: 0.30, y: 0.05, width: 0.40, height: 0.20 },
    notes: 'Minor snow coverage on upper edge - partial obstruction',
    createdAt: '2026-01-14T11:35:00Z',
  },
];

export const mockDashboardStats: DashboardStats = {
  totalPanels: mockPanels.length,
  activePanels: mockPanels.filter(p => p.status === 'OK').length,
  warningPanels: mockPanels.filter(p => p.status === 'WARNING').length,
  faultPanels: mockPanels.filter(p => p.status === 'FAULT').length,
  totalSites: mockSites.length,
  openAnomalies: mockAnomalies.filter(a => a.status === 'OPEN').length,
  pendingMissions: mockMissions.filter(m => m.status === 'PENDING_APPROVAL').length,
  avgPowerOutput: 342.5,
};
