import type { PanelStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export const panelStatusStyles: Record<PanelStatus, string> = {
  OK: 'bg-success/10 text-success border-success/20',
  WARNING: 'bg-warning/10 text-warning border-warning/20',
  FAULT: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const panelStatusBadgeVariants: Record<
  PanelStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  OK: 'default',
  WARNING: 'secondary',
  FAULT: 'destructive',
};

const panelStatusLegendColors: Record<PanelStatus, string> = {
  OK: 'bg-primary',
  WARNING: 'bg-warning',
  FAULT: 'bg-destructive',
};

const PANEL_STATUS_INFO: Record<
  PanelStatus,
  { summary: string; details: string[] }
> = {
  OK: {
    summary: 'Latest telemetry is normal and there are no active inspection failures for this panel.',
    details: [
      'The newest analyzed telemetry row is not marked as an anomaly.',
      'No current CV inspection result with FAIL status is keeping the panel in warning or fault.',
    ],
  },
  WARNING: {
    summary: 'The panel has a current issue that needs attention, but it is below the fault threshold.',
    details: [
      'This appears when the strongest active signal maps to a warning-level issue.',
      'Typical causes are a non-high telemetry anomaly or an active inspection failure that is not high confidence.',
    ],
  },
  FAULT: {
    summary: 'The panel has a high-severity active issue and should be reviewed as a priority.',
    details: [
      'This appears when the strongest active signal maps to fault level.',
      'Typical causes are a high telemetry anomaly or a high-confidence active inspection failure.',
    ],
  },
};

const PANEL_STATUS_PIPELINE = [
  'Checks the latest analyzed telemetry row for a current ML anomaly on the panel.',
  'Checks active CV inspection results that still have FAIL status for the same panel.',
  'Uses the strongest active signal, so FAULT overrides WARNING.',
  'If neither source currently raises an issue, the panel returns to OK.',
];

function formatStatusLabel(status: PanelStatus) {
  if (status === 'WARNING') return 'Warning';
  if (status === 'FAULT') return 'Fault';
  return 'OK';
}

interface PanelStatusExplanationDialogProps {
  status: PanelStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PanelStatusExplanationDialog({
  status,
  open,
  onOpenChange,
}: PanelStatusExplanationDialogProps) {
  if (!status) return null;

  const info = PANEL_STATUS_INFO[status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={panelStatusBadgeVariants[status]}>{status}</Badge>
            Status Explanation
          </DialogTitle>
          <DialogDescription>{info.summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            {info.details.map((detail) => (
              <div key={detail} className="rounded-lg border bg-muted/20 p-3">
                {detail}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">How It Is Determined</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              {PANEL_STATUS_PIPELINE.map((step) => (
                <div key={step} className="rounded-lg border bg-muted/20 p-3">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PanelStatusLegendProps {
  onSelectStatus: (status: PanelStatus) => void;
}

export function PanelStatusLegend({ onSelectStatus }: PanelStatusLegendProps) {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Status:</span>
        {(['OK', 'WARNING', 'FAULT'] as PanelStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onSelectStatus(status)}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent"
            aria-label={`Explain ${status.toLowerCase()} status`}
          >
            <div className={cn('h-4 w-4 rounded', panelStatusLegendColors[status])} />
            <span>{formatStatusLabel(status)}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Click a status to learn how it is determined.
      </p>
    </>
  );
}
