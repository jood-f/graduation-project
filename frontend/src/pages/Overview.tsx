import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { TelemetryChart } from '@/components/dashboard/TelemetryChart';
import { RecentAnomalies } from '@/components/dashboard/RecentAnomalies';
import { MissionQueue } from '@/components/dashboard/MissionQueue';
import { PanelHeatmap } from '@/components/dashboard/PanelHeatmap';
import { usePanelStats } from '@/hooks/usePanels';
import { Zap, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Overview() {
  const { data: stats, isLoading } = usePanelStats();

  return (
    <MainLayout title="Overview">
      {/* KPI Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <StatsCard
              title="Active Panels"
              value={stats?.ok || 0}
              icon={CheckCircle}
              variant="success"
            />
            <StatsCard
              title="Warning Panels"
              value={stats?.warning || 0}
              icon={AlertTriangle}
              variant="warning"
            />
            <StatsCard
              title="Fault Panels"
              value={stats?.fault || 0}
              icon={XCircle}
              variant="destructive"
            />
            <StatsCard
              title="Total Panels"
              value={stats?.total || 0}
              icon={Zap}
              variant="default"
            />
          </>
        )}
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
