export type UserRole = 'admin' | 'operator' | 'drone_team';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  locationLat: number;
  locationLng: number;
  createdAt: string;
}

export type PanelStatus = 'OK' | 'WARNING' | 'FAULT';

export interface Panel {
  id: string;
  siteId: string;
  siteName: string;
  label: string;
  serialNumber: string;
  installedAt: string;
  status: PanelStatus;
}

export interface Telemetry {
  id: string;
  panelId: string;
  ts: string;
  voltage: number;
  current: number;
  temperature: number;
  irradiance: number;
  acPower: number;
  dcPower: number;
}

export type AnomalyType = 'POWER_DROP' | 'OVERHEAT' | 'ML_FLAG' | 'OTHER';
export type AnomalySeverity = 'LOW' | 'MED' | 'HIGH';
export type AnomalySource = 'ON_DEVICE_ML' | 'BACKEND_RULE';
export type AnomalyStatus = 'OPEN' | 'ACKED' | 'CLOSED';

export interface Anomaly {
  id: string;
  panelId: string;
  panelLabel: string;
  siteName: string;
  ts: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  source: AnomalySource;
  status: AnomalyStatus;
  message: string;
}

export type MissionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_FLIGHT' | 'COMPLETED' | 'CANCELLED';

export interface Mission {
  id: string;
  panelId: string;
  panelLabel: string;
  siteName: string;
  status: MissionStatus;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface MissionImage {
  id: string;
  missionId: string;
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  uploadedAt: string;
  url: string;
}

export type DefectType = 'CRACK' | 'DUST' | 'HOTSPOT' | 'SNOW';

export interface InspectionResult {
  id: string;
  missionId: string;
  defectType: DefectType;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  notes: string;
  createdAt: string;
}

export interface DashboardStats {
  totalPanels: number;
  activePanels: number;
  warningPanels: number;
  faultPanels: number;
  totalSites: number;
  openAnomalies: number;
  pendingMissions: number;
  avgPowerOutput: number;
}
