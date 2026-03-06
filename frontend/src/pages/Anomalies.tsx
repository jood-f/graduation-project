import { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useFaults, useCVAnomalies } from '@/hooks/useFaults';
import { useSites } from '@/hooks/useSites';
import { cn } from '@/lib/utils';

type Severity = 'LOW' | 'MED' | 'HIGH';
type ModelType = 'ML' | 'CV';

const severityStyles = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

const modelStyles = {
  ML: 'bg-primary/10 text-primary border-primary/20',
  CV: 'bg-secondary text-secondary-foreground border-border',
};

interface CombinedAnomaly {
  id: string;
  panel_label: string;
  site_name: string;
  anomaly_type: string;
  severity: Severity;
  model: ModelType;
  detected_at: string;
  confidence: number | null;
}

function getSeverity(confidence: number): Severity {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.7) return 'MED';
  return 'LOW';
}

export default function Anomalies() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const { data: faults, isLoading: mlLoading } = useFaults();
  const { data: cvAnomalies, isLoading: cvLoading } = useCVAnomalies();
  const { data: sites } = useSites();

  const allAnomalies = useMemo<CombinedAnomaly[]>(() => {
    const mlRows: CombinedAnomaly[] = (faults || []).map((fault) => ({
      id: `ml-${fault.id}`,
      panel_label: fault.panel_label || 'Unknown',
      site_name: fault.site_name || 'Unknown Site',
      anomaly_type: fault.fault_type,
      severity: getSeverity(fault.confidence),
      model: 'ML',
      detected_at: fault.detected_at,
      confidence: fault.confidence,
    }));

    const cvRows: CombinedAnomaly[] = (cvAnomalies || []).map((item) => ({
      id: `cv-${item.id}`,
      panel_label: item.panel_label || 'Unknown',
      site_name: item.site_name || 'Unknown Site',
      anomaly_type: item.defect_type,
      severity: getSeverity(item.confidence),
      model: 'CV',
      detected_at: item.inspected_at,
      confidence: item.confidence,
    }));

    return [...mlRows, ...cvRows].sort(
      (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
    );
  }, [faults, cvAnomalies]);

  const filteredAnomalies = useMemo(() => {
    return allAnomalies.filter((item) => {
      const matchesSeverity = severityFilter === 'all' || item.severity === severityFilter;
      const matchesSite =
        siteFilter === 'all' || item.site_name === sites?.find((s) => s.id === siteFilter)?.name;
      const matchesModel = modelFilter === 'all' || item.model === modelFilter;
      return matchesSeverity && matchesSite && matchesModel;
    });
  }, [allAnomalies, severityFilter, siteFilter, modelFilter, sites]);

  const isLoading = mlLoading || cvLoading;

  return (
    <MainLayout title="Anomalies">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Detected Anomalies ({filteredAnomalies.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="ML">ML</SelectItem>
                  <SelectItem value="CV">CV</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MED">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnomalies.map((item) => {
                  const severity = item.severity as Severity;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{item.anomaly_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{item.panel_label}</TableCell>
                      <TableCell>{item.site_name}</TableCell>
                      <TableCell>
                        <Badge className={cn(modelStyles[item.model])}>{item.model}</Badge>
                      </TableCell>
                      <TableCell>
                        {item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(severityStyles[severity])}>{severity}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(item.detected_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!isLoading && filteredAnomalies.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No anomalies found for the selected filters.</p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
