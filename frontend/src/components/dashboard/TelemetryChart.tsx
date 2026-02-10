import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLatestTelemetry } from '@/hooks/useTelemetry';

export function TelemetryChart() {
  const { data: telemetry, isLoading, error } = useLatestTelemetry(12);

  const chartData = useMemo(() => {
    if (!telemetry || telemetry.length === 0) return [];
    
    // Group by hour and average the power
    const hourlyData: { [key: string]: { total: number; count: number } } = {};
    
    telemetry.forEach(t => {
      const hour = new Date(t.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      if (!hourlyData[hour]) {
        hourlyData[hour] = { total: 0, count: 0 };
      }
      hourlyData[hour].total += t.power || 0;
      hourlyData[hour].count += 1;
    });

    return Object.entries(hourlyData).map(([time, data]) => ({
      time,
      power: Math.round(data.total / data.count),
    }));
  }, [telemetry]);

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Power Output (Last 12 Hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Power Output (Last 12 Hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            {error ? 'Error loading telemetry data' : 'No telemetry data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Power Output (Last 12 Hours)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
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
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
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
