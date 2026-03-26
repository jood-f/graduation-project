import { Camera, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMissions, type Mission } from '@/hooks/useMissions';
import { cn } from '@/lib/utils';

type MissionStatus = 'OPEN' | 'COMPLETED';

const statusStyles: Record<MissionStatus, { bg: string; icon: React.ElementType }> = {
  OPEN: { bg: 'bg-info/10 text-info', icon: Clock },
  COMPLETED: { bg: 'bg-success/10 text-success', icon: CheckCircle },
};

function MissionItem({ mission }: { mission: Mission }) {
  const statusKey = mission.status.toUpperCase() as MissionStatus;
  const status = statusStyles[statusKey] || statusStyles.OPEN;
  const StatusIcon = status.icon;
  
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className={cn('w-fit rounded-lg p-2', status.bg)}>
        <Camera className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="break-words font-medium">{mission.panel_label || 'Unknown Panel'}</span>
          <Badge variant="outline" className="text-xs">
            {mission.site_name || 'Unknown Site'}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Created {new Date(mission.created_at).toLocaleDateString()}
        </p>
      </div>
      <Badge className={cn('w-fit shrink-0 gap-1', status.bg)}>
        <StatusIcon className="h-3 w-3" />
        {mission.status === 'OPEN' ? 'Open' : 'Completed'}
      </Badge>
    </div>
  );
}

export function MissionQueue() {
  const { data: missions, isLoading } = useMissions();
  
  const activeMissions = (missions || [])
    .filter(m => m.status === 'OPEN')
    .slice(0, 3);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Inspections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Inspections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeMissions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No open inspections
          </p>
        ) : (
          activeMissions.map(mission => (
            <MissionItem key={mission.id} mission={mission} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
