import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLatestTelemetry } from '@/hooks/useTelemetry';

export function TelemetryChart() {
  const { data: telemetryResult, isLoading, error } = useLatestTelemetry(12);
  const telemetry = telemetryResult?.telemetry ?? [];
  const isFallback = telemetryResult?.isFallback ?? false;
  const anchorTimestamp = telemetryResult?.anchorTimestamp;
  const chartTitle = isFallback ? 'Power Output (Latest Available Data)' : 'Power Output (Last 12 Hours)';

  const chartData = useMemo(() => {
    if (!telemetry || telemetry.length === 0) return [];

    const hourlyData = new Map<string, { total: number; count: number }>();

    telemetry.forEach((t) => {
      const bucket = new Date(t.timestamp);
      bucket.setMinutes(0, 0, 0);
      const key = bucket.toISOString();
      const entry = hourlyData.get(key) || { total: 0, count: 0 };
      entry.total += t.power || 0;
      entry.count += 1;
      hourlyData.set(key, entry);
    });

    return Array.from(hourlyData.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([timestamp, data]) => ({
        time: new Date(timestamp).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        power: Math.round(data.total / data.count),
      }));
  }, [telemetry]);

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

  if (error || chartData.length === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="flex h-[260px] items-center justify-center text-center text-muted-foreground sm:h-[300px]">
          {error ? 'Error loading telemetry data' : 'No telemetry data available'}
        </div>
      </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>{chartTitle}</CardTitle>
          {isFallback && anchorTimestamp && (
            <p className="text-xs text-muted-foreground">
              Recent data is sparse. Showing latest available history ending{' '}
              {new Date(anchorTimestamp).toLocaleString()}.
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
                minTickGap={28}
                tickMargin={8}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                width={40}
              />
              <Tooltip
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
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
