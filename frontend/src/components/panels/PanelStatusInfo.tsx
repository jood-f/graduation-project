import type { PanelStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const panelStatusStyles: Record<PanelStatus, string> = {
  OK: 'bg-success/10 text-success border-success/20',
  WARNING: 'bg-warning/10 text-warning border-warning/20',
  FAULT: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface PanelStatusExplanation {
  title: string;
  description: string;
  recommendation: string;
  basis: string;
}

const PANEL_STATUS_INFO: Record<PanelStatus, PanelStatusExplanation> = {
  OK: {
    title: 'Panel healthy',
    description: 'The latest telemetry looks normal and there is no active failed inspection driving the panel into warning or fault.',
    recommendation: 'Keep monitoring the panel during normal operations.',
    basis: 'Based on the latest ML telemetry result and active CV inspection results.',
  },
  WARNING: {
    title: 'Needs attention',
    description: 'The panel currently has an issue, but it has not reached the highest severity level.',
    recommendation: 'Review recent anomalies or inspection results soon.',
    basis: 'This appears when the strongest active signal maps to a warning-level issue.',
  },
  FAULT: {
    title: 'Priority issue',
    description: 'The panel has a high-severity active issue and is more likely to affect performance.',
    recommendation: 'Prioritize inspection or maintenance as soon as possible.',
    basis: 'This appears when the strongest active signal maps to fault level.',
  },
};

function formatStatusLabel(status: PanelStatus) {
  if (status === 'WARNING') return 'Warning';
  if (status === 'FAULT') return 'Fault';
  return 'OK';
}

export function getPanelStatusExplanation(status: PanelStatus): PanelStatusExplanation {
  return PANEL_STATUS_INFO[status];
}

interface PanelStatusBadgeProps {
  status: PanelStatus;
  className?: string;
}

export function PanelStatusBadge({ status, className }: PanelStatusBadgeProps) {
  const explanation = getPanelStatusExplanation(status);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`What does ${status.toLowerCase()} status mean?`}
        >
          <Badge className={cn('cursor-help select-none', panelStatusStyles[status], className)}>
            {status}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" side="top">
        <div className="flex items-center gap-2">
          <Badge className={panelStatusStyles[status]}>{status}</Badge>
          <p className="text-sm font-semibold">{explanation.title}</p>
        </div>
        <p className="text-sm text-muted-foreground">{explanation.description}</p>
        <p className="text-xs text-muted-foreground">{explanation.recommendation}</p>
        <p className="text-xs text-muted-foreground">{explanation.basis}</p>
      </PopoverContent>
    </Popover>
  );
}

export function PanelStatusLegend() {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Status:</span>
        {(['OK', 'WARNING', 'FAULT'] as PanelStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-2">
            <PanelStatusBadge status={status} />
            <span>{formatStatusLabel(status)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tap a status badge to see what it means.
      </p>
    </>
  );
}
