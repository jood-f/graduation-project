import { AlertTriangle, Thermometer, Zap, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockAnomalies } from '@/data/mockData';
import type { Anomaly, AnomalyType, AnomalySeverity } from '@/types';
import { cn } from '@/lib/utils';

const typeIcons: Record<AnomalyType, React.ElementType> = {
  POWER_DROP: Zap,
  OVERHEAT: Thermometer,
  ML_FLAG: AlertTriangle,
  OTHER: HelpCircle,
};

const severityStyles: Record<AnomalySeverity, string> = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

function AnomalyItem({ anomaly }: { anomaly: Anomaly }) {
  const Icon = typeIcons[anomaly.type];
  
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className={cn('rounded-lg p-2', severityStyles[anomaly.severity])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{anomaly.panelLabel}</span>
          <Badge variant="outline" className="text-xs">
            {anomaly.siteName}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
          {anomaly.message}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(anomaly.ts).toLocaleString()}
        </p>
      </div>
      <Badge className={cn('shrink-0', severityStyles[anomaly.severity])}>
        {anomaly.severity}
      </Badge>
    </div>
  );
}

export function RecentAnomalies() {
  const recentAnomalies = mockAnomalies
    .filter(a => a.status === 'OPEN')
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Anomalies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentAnomalies.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No open anomalies
          </p>
        ) : (
          recentAnomalies.map(anomaly => (
            <AnomalyItem key={anomaly.id} anomaly={anomaly} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
