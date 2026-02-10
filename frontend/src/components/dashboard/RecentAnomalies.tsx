import { AlertTriangle, Thermometer, Zap, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFaults } from '@/hooks/useFaults';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, React.ElementType> = {
  'Power Drop': Zap,
  'Hotspot': Thermometer,
  'Crack': AlertTriangle,
  'Soiling': HelpCircle,
  'Cell Damage': AlertTriangle,
  'default': AlertTriangle,
};

const getSeverity = (confidence: number): 'LOW' | 'MED' | 'HIGH' => {
  if (confidence >= 0.8) return 'HIGH';
  if (confidence >= 0.5) return 'MED';
  return 'LOW';
};

const severityStyles: Record<string, string> = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface FaultItemProps {
  fault: {
    id: string;
    panel_label?: string;
    site_name?: string;
    fault_type: string;
    confidence: number;
    detected_at: string;
  };
}

function FaultItem({ fault }: FaultItemProps) {
  const Icon = typeIcons[fault.fault_type] || typeIcons['default'];
  const severity = getSeverity(fault.confidence);
  
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className={cn('rounded-lg p-2', severityStyles[severity])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{fault.panel_label || 'Unknown Panel'}</span>
          <Badge variant="outline" className="text-xs">
            {fault.site_name || 'Unknown Site'}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
          {fault.fault_type} detected ({Math.round(fault.confidence * 100)}% confidence)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(fault.detected_at).toLocaleString()}
        </p>
      </div>
      <Badge className={cn('shrink-0', severityStyles[severity])}>
        {severity}
      </Badge>
    </div>
  );
}

export function RecentAnomalies() {
  const { data: faults, isLoading, error } = useFaults();
  
  const recentFaults = (faults || []).slice(0, 3);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Anomalies</CardTitle>
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
        <CardTitle>Recent Anomalies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentFaults.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No anomalies detected
          </p>
        ) : (
          recentFaults.map(fault => (
            <FaultItem key={fault.id} fault={fault} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
