import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { TelemetryChart } from '@/components/dashboard/TelemetryChart';
import { RecentAnomalies } from '@/components/dashboard/RecentAnomalies';
import { MissionQueue } from '@/components/dashboard/MissionQueue';
import { PanelHeatmap } from '@/components/dashboard/PanelHeatmap';
import { mockDashboardStats } from '@/data/mockData';
import { Zap, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function Overview() {
  const stats = mockDashboardStats;

  return (
    <MainLayout title="Overview">
      {/* KPI Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Panels"
          value={stats.activePanels}
          icon={CheckCircle}
          variant="success"
          trend={{ value: 2.5, isPositive: true }}
        />
        <StatsCard
          title="Warning Panels"
          value={stats.warningPanels}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatsCard
          title="Fault Panels"
          value={stats.faultPanels}
          icon={XCircle}
          variant="destructive"
        />
        <StatsCard
          title="Avg Power Output"
          value={`${stats.avgPowerOutput}W`}
          icon={Zap}
          variant="default"
          trend={{ value: 5.2, isPositive: true }}
        />
      </div>

      {/* Charts & Widgets */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <TelemetryChart />
        <RecentAnomalies />
      </div>

      <div className="mt-6">
        <MissionQueue />
      </div>

      {/* Panel Heatmap */}
      <div className="mt-6">
        <PanelHeatmap />
      </div>
    </MainLayout>
  );
}
