import { Plane, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockMissions } from '@/data/mockData';
import type { Mission, MissionStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusStyles: Record<MissionStatus, { bg: string; icon: React.ElementType }> = {
  DRAFT: { bg: 'bg-muted text-muted-foreground', icon: Clock },
  PENDING_APPROVAL: { bg: 'bg-warning/10 text-warning', icon: Clock },
  APPROVED: { bg: 'bg-info/10 text-info', icon: CheckCircle },
  IN_FLIGHT: { bg: 'bg-primary/10 text-primary', icon: Plane },
  COMPLETED: { bg: 'bg-success/10 text-success', icon: CheckCircle },
  CANCELLED: { bg: 'bg-destructive/10 text-destructive', icon: XCircle },
};

function MissionItem({ mission }: { mission: Mission }) {
  const status = statusStyles[mission.status];
  const StatusIcon = status.icon;
  
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className={cn('rounded-lg p-2', status.bg)}>
        <Plane className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{mission.panelLabel}</span>
          <Badge variant="outline" className="text-xs">
            {mission.siteName}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Created {new Date(mission.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Badge className={cn('shrink-0 gap-1', status.bg)}>
        <StatusIcon className="h-3 w-3" />
        {mission.status.replace('_', ' ')}
      </Badge>
    </div>
  );
}

export function MissionQueue() {
  const activeMissions = mockMissions
    .filter(m => !['COMPLETED', 'CANCELLED'].includes(m.status))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mission Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeMissions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No active missions
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
