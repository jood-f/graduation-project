import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePanels } from '@/hooks/usePanels';
import { type TelemetryPeriod, useLatestTelemetry } from '@/hooks/useTelemetry';

const PERIOD_LABELS: Record<TelemetryPeriod, string> = {
  day: '24h',
  week: 'Week',
  month: 'Month',
};

const PERIOD_SELECT_LABELS: Record<TelemetryPeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

const PERIOD_WINDOW_LABELS: Record<TelemetryPeriod, string> = {
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

function getPanelDisplayName(panel: { id: string; label: string | null; site_name?: string } | null) {
  if (!panel) return 'Unknown Panel';
  const label = panel.label?.trim();
  return label || `Panel ${panel.id.slice(0, 4).toUpperCase()}`;
}

export function TelemetryChart() {
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [period, setPeriod] = useState<TelemetryPeriod>('day');

  const { data: panels, isLoading: panelsLoading } = usePanels();
  const availablePanels = panels ?? [];
  const siteOptions = useMemo(() => {
    const uniqueSites = new Map<string, string>();

    availablePanels.forEach((panel) => {
      if (!uniqueSites.has(panel.site_id)) {
        uniqueSites.set(panel.site_id, panel.site_name || 'Unknown Site');
      }
    });

    return Array.from(uniqueSites.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePanels]);

  const filteredPanels = useMemo(() => {
    if (selectedSiteId === 'all') return availablePanels;
    return availablePanels.filter((panel) => panel.site_id === selectedSiteId);
  }, [availablePanels, selectedSiteId]);

  const effectivePanelId = useMemo(() => {
    if (!filteredPanels.length) return null;
    if (selectedPanelId && filteredPanels.some((panel) => panel.id === selectedPanelId)) {
      return selectedPanelId;
    }
    return filteredPanels[0].id;
  }, [filteredPanels, selectedPanelId]);

  const selectedPanel = useMemo(
    () => filteredPanels.find((panel) => panel.id === effectivePanelId) ?? null,
    [filteredPanels, effectivePanelId]
  );
  const selectedSiteLabel = useMemo(
    () => siteOptions.find((site) => site.id === selectedSiteId)?.name ?? 'All Sites',
    [selectedSiteId, siteOptions]
  );

  const { data: telemetryResult, isLoading: telemetryLoading, error } = useLatestTelemetry(
    effectivePanelId ?? undefined,
    period
  );
  const telemetry = telemetryResult?.telemetry ?? [];
  const isFallback = telemetryResult?.isFallback ?? false;
  const anchorTimestamp = telemetryResult?.anchorTimestamp;
  const chartTitle = `Power Output (${PERIOD_LABELS[period]})`;

  const chartData = useMemo(() => {
    if (!telemetry || telemetry.length === 0) return [];

    const aggregatedData = new Map<
      string,
      { total: number; count: number; label: string; tooltipLabel: string }
    >();

    telemetry.forEach((t) => {
      const bucket = new Date(t.timestamp);
      if (period === 'day') {
        bucket.setMinutes(0, 0, 0);
      } else {
        bucket.setHours(0, 0, 0, 0);
      }

      const key = bucket.toISOString();
      const entry = aggregatedData.get(key) || {
        total: 0,
        count: 0,
        label:
          period === 'day'
            ? bucket.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : bucket.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }),
        tooltipLabel:
          period === 'day'
            ? bucket.toLocaleString()
            : bucket.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }),
      };

      entry.total += t.power || 0;
      entry.count += 1;
      aggregatedData.set(key, entry);
    });

    return Array.from(aggregatedData.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([timestamp, data]) => ({
        timestamp,
        time: data.label,
        tooltipLabel: data.tooltipLabel,
        power: Math.round((data.total / data.count) * 100) / 100,
      }));
  }, [period, telemetry]);

  const isLoading = panelsLoading || (!!effectivePanelId && telemetryLoading);
  const selectedPanelLabel = getPanelDisplayName(selectedPanel);
  const selectedPanelTitle = selectedPanel
    ? `${selectedPanelLabel}${selectedPanel.site_name ? ` (${selectedPanel.site_name})` : ''}`
    : 'Select panel';
  const panelOptionLabel = (panel: { id: string; label: string | null; site_name?: string }) =>
    `${getPanelDisplayName(panel)}${panel.site_name ? ` (${panel.site_name})` : ''}`;

  const subtitle = isFallback && anchorTimestamp
    ? `Recent data is sparse. Showing latest available ${period} ending ${new Date(anchorTimestamp).toLocaleString()}.`
    : `${PERIOD_WINDOW_LABELS[period]} for ${selectedPanelLabel}.`;

  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!availablePanels.length) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>{chartTitle}</CardTitle>
            <p className="text-xs text-muted-foreground">No panels available for telemetry.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] items-center justify-center text-center text-muted-foreground sm:h-[300px]">
            No telemetry data available
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!filteredPanels.length) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>{chartTitle}</CardTitle>
              <p className="text-xs text-muted-foreground">No panels available for the selected site.</p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_120px] lg:w-[640px]">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Site</p>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All sites">{selectedSiteLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {siteOptions.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Panel</p>
                <Select value={effectivePanelId ?? undefined} onValueChange={setSelectedPanelId} disabled>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Select panel" />
                  </SelectTrigger>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Period</p>
                <Select value={period} onValueChange={(value) => setPeriod(value as TelemetryPeriod)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Period">{PERIOD_SELECT_LABELS[period]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] items-center justify-center text-center text-muted-foreground sm:h-[300px]">
            No telemetry data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{chartTitle}</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_120px] lg:w-[640px]">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Site</p>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All sites">{selectedSiteLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {siteOptions.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Panel</p>
              <Select
                value={effectivePanelId ?? undefined}
                onValueChange={setSelectedPanelId}
              >
                <SelectTrigger className="w-full min-w-0" title={selectedPanelTitle}>
                  <SelectValue placeholder="Select panel">{selectedPanelLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredPanels.map((panel) => (
                    <SelectItem key={panel.id} value={panel.id}>
                      {panelOptionLabel(panel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Period</p>
              <Select value={period} onValueChange={(value) => setPeriod(value as TelemetryPeriod)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Period">{PERIOD_SELECT_LABELS[period]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error || chartData.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-center text-muted-foreground sm:h-[300px]">
            {error ? 'Error loading telemetry data' : 'No telemetry data available for this panel and period'}
          </div>
        ) : (
          <div className="h-[260px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  minTickGap={period === 'day' ? 28 : 20}
                  tickMargin={8}
                />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  width={56}
                />
                <Tooltip
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.tooltipLabel ?? ''}
                  formatter={(value: number) => [`${value.toFixed(2)} W`, 'Power']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="power"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#powerGradient)"
                  dot={chartData.length === 1 ? { r: 4 } : false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
