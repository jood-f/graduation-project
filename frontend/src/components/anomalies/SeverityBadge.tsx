import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  getSeverityExplanation,
  type Severity,
} from '@/lib/anomalySeverity';
import { cn } from '@/lib/utils';

const severityStyles: Record<Severity, string> = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const explanation = getSeverityExplanation(severity);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`What does ${severity.toLowerCase()} severity mean?`}
        >
          <Badge className={cn('cursor-help select-none', severityStyles[severity], className)}>
            {severity}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" side="top">
        <div className="flex items-center gap-2">
          <Badge className={severityStyles[severity]}>{severity}</Badge>
          <p className="text-sm font-semibold">{explanation.title}</p>
        </div>
        <p className="text-sm text-muted-foreground">{explanation.description}</p>
        <p className="text-xs text-muted-foreground">{explanation.recommendation}</p>
      </PopoverContent>
    </Popover>
  );
}
