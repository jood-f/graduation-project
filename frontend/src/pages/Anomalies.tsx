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
import { SeverityBadge } from '@/components/anomalies/SeverityBadge';
import { useFaults, useCVAnomalies } from '@/hooks/useFaults';
import { useSites } from '@/hooks/useSites';
import {
  type Severity,
} from '@/lib/anomalySeverity';
import { buildAnomalyFeed } from '@/lib/anomalyFeed';
import { cn } from '@/lib/utils';

const modelStyles = {
  ML: 'bg-primary/10 text-primary border-primary/20',
  CV: 'bg-secondary text-secondary-foreground border-border',
};

export default function Anomalies() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [panelFilter, setPanelFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const { data: faults, isLoading: mlLoading } = useFaults();
  const { data: cvAnomalies, isLoading: cvLoading } = useCVAnomalies();
  const { data: sites } = useSites();

  const allAnomalies = useMemo(
    () => buildAnomalyFeed(faults, cvAnomalies),
    [faults, cvAnomalies]
  );

  const selectedSiteName = useMemo(
    () => sites?.find((site) => site.id === siteFilter)?.name,
    [siteFilter, sites]
  );

  const availablePanels = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; siteName: string }>();

    allAnomalies.forEach((item) => {
      if (selectedSiteName && item.site_name !== selectedSiteName) {
        return;
      }

      if (!seen.has(item.panel_key)) {
        seen.set(item.panel_key, {
          key: item.panel_key,
          label: item.panel_label,
          siteName: item.site_name,
        });
      }
    });

    return Array.from(seen.values()).sort((a, b) => {
      const labelCompare = a.label.localeCompare(b.label);
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return a.siteName.localeCompare(b.siteName);
    });
  }, [allAnomalies, selectedSiteName]);

  const filteredResult = useMemo(() => {
    const items = allAnomalies.filter((item) => {
      const matchesSeverity = severityFilter === 'all' || item.severity === severityFilter;
      const matchesSite = siteFilter === 'all' || item.site_name === selectedSiteName;
      const matchesPanel = panelFilter === 'all' || item.panel_key === panelFilter;
      const matchesModel = modelFilter === 'all' || item.model === modelFilter;
      return matchesSeverity && matchesSite && matchesPanel && matchesModel;
    });

    const rawCount = items.reduce((total, item) => total + item.occurrence_count, 0);

    return {
      items,
      rawCount,
      duplicateCount: rawCount - items.length,
    };
  }, [allAnomalies, severityFilter, siteFilter, selectedSiteName, panelFilter, modelFilter]);

  const filteredAnomalies = filteredResult.items;

  const isLoading = mlLoading || cvLoading;

  return (
    <MainLayout title="Anomalies">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle>Detected Anomalies ({filteredAnomalies.length})</CardTitle>
            <div className="grid w-full gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap">
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="ML">ML</SelectItem>
                  <SelectItem value="CV">CV</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MED">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={siteFilter}
                onValueChange={(value) => {
                  setSiteFilter(value);
                  setPanelFilter('all');
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
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
              <Select value={panelFilter} onValueChange={setPanelFilter}>
                <SelectTrigger className="w-full sm:col-span-2 xl:w-[220px]">
                  <SelectValue placeholder="All Panels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Panels</SelectItem>
                  {availablePanels.map((panel) => (
                    <SelectItem key={panel.key} value={panel.key}>
                      {panel.label}
                      {siteFilter === 'all' ? ` (${panel.siteName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!isLoading && (
            <div className="space-y-1 text-sm text-muted-foreground">
              {filteredResult.duplicateCount > 0 && (
                <p>
                  Showing unique anomaly rows. {filteredResult.duplicateCount} duplicate
                  {filteredResult.duplicateCount === 1 ? '' : 's'} merged from {filteredResult.rawCount} raw
                  results.
                </p>
              )}
              <p>Tap any severity badge to see what it means.</p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-4 md:hidden">
                {filteredAnomalies.map((item) => {
                  const severity = item.severity as Severity;
                  return (
                    <div key={item.id} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium">{item.anomaly_type}</p>
                          <p className="text-sm text-muted-foreground">{item.panel_label}</p>
                          <p className="text-sm text-muted-foreground">{item.site_name}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={cn(modelStyles[item.model])}>{item.model}</Badge>
                        <SeverityBadge severity={severity} />
                        <Badge variant="outline">
                          {item.confidence != null ? `${item.confidence_label} confidence` : 'No confidence'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.detected_label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table className="min-w-[50rem]">
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
                            {item.confidence_label}
                          </TableCell>
                          <TableCell>
                            <SeverityBadge severity={severity} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.detected_label}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {!isLoading && filteredAnomalies.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No anomalies found for the selected filters.</p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
