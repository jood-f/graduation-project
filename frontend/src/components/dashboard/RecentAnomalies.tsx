import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Thermometer, Zap, HelpCircle } from 'lucide-react';
import { SeverityBadge } from '@/components/anomalies/SeverityBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFaults, useCVAnomalies } from '@/hooks/useFaults';
import { buildAnomalyFeed, type DisplayAnomalyRow } from '@/lib/anomalyFeed';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, React.ElementType> = {
  'Power Drop': Zap,
  'Hotspot': Thermometer,
  'Crack': AlertTriangle,
  'Soiling': HelpCircle,
  'Cell Damage': AlertTriangle,
  'default': AlertTriangle,
};

const severityStyles: Record<string, string> = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface FaultItemProps {
  fault: DisplayAnomalyRow;
}

function FaultItem({ fault }: FaultItemProps) {
  const Icon = typeIcons[fault.anomaly_type] || typeIcons['default'];
  const severity = fault.severity;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className={cn('w-fit rounded-lg p-2', severityStyles[severity])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="break-words font-medium">{fault.panel_label || 'Unknown Panel'}</span>
          <Badge variant="outline" className="text-xs">
            {fault.site_name || 'Unknown Site'}
          </Badge>
          {fault.occurrence_count > 1 && (
            <Badge variant="outline" className="text-xs">
              x{fault.occurrence_count}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
          {fault.anomaly_type} detected (
          {fault.confidence != null ? `${fault.confidence_label} confidence` : 'No confidence'})
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fault.detected_label}
        </p>
      </div>
      <SeverityBadge severity={severity} className="w-fit shrink-0" />
    </div>
  );
}

export function RecentAnomalies() {
  const { data: faults, isLoading: mlLoading } = useFaults();
  const { data: cvAnomalies, isLoading: cvLoading } = useCVAnomalies();

  const isLoading = mlLoading || cvLoading;

  const recentItems = useMemo(() => {
    return buildAnomalyFeed(faults, cvAnomalies).slice(0, 3);
  }, [faults, cvAnomalies]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recent Anomalies</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/anomalies">
                All Anomalies
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Recent Anomalies</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/anomalies">
              All Anomalies
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentItems.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No anomalies detected
          </p>
        ) : (
          recentItems.map(item => (
            <FaultItem key={item.id} fault={item} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
