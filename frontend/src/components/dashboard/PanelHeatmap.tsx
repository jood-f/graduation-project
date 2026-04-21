import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePanels, type Panel } from '@/hooks/usePanels';
import { useSites } from '@/hooks/useSites';
import { useFaults, useCVAnomalies } from '@/hooks/useFaults';
import { supabase } from '@/integrations/supabase/client';
import type { PanelStatus } from '@/types';
import {
  type Severity,
  formatAnomalyConfidence,
  getAnomalySeverity,
  normalizeAnomalyConfidence,
} from '@/lib/anomalySeverity';
import {
  PanelStatusExplanationDialog,
  PanelStatusLegend,
  panelStatusBadgeVariants,
} from '@/components/panels/PanelStatusInfo';
import { Activity, AlertTriangle, MapPin, Zap, Filter } from 'lucide-react';

const statusColors: Record<string, string> = {
  OK: 'bg-primary hover:bg-primary/80',
  WARNING: 'bg-warning hover:bg-warning/80',
  FAULT: 'bg-destructive hover:bg-destructive/80',
};

type PanelAnomaly = {
  id: string;
  source: 'ML' | 'CV';
  type: string;
  severity: Severity;
  message: string;
  detected_at: string;
};

function getDisplayPanelName(panel: Pick<Panel, 'id' | 'label'> | null | undefined) {
  const label = panel?.label?.trim();
  if (label) return label;
  if (!panel?.id) return 'Unknown Panel';
  return `Panel ${panel.id.slice(0, 4).toUpperCase()}`;
}

function getDisplaySiteName(panel: Pick<Panel, 'site_id' | 'site_name'> | null | undefined) {
  const siteName = panel?.site_name?.trim();
  if (siteName) return siteName;
  if (!panel?.site_id) return 'Unknown Site';
  return `Site ${panel.site_id.slice(0, 4).toUpperCase()}`;
}

export function PanelHeatmap() {
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
  const [selectedStatusInfo, setSelectedStatusInfo] = useState<PanelStatus | null>(null);
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: panels, isLoading: panelsLoading } = usePanels();
  const { data: sites } = useSites();
  const { data: faults } = useFaults();
  const { data: cvAnomalies } = useCVAnomalies();

  const filteredPanels = useMemo(() => {
    return (panels || []).filter((panel) => {
      const matchesSite = siteFilter === 'all' || panel.site_id === siteFilter;
      const matchesStatus = statusFilter === 'all' || panel.status === statusFilter;
      return matchesSite && matchesStatus;
    });
  }, [panels, siteFilter, statusFilter]);

  const panelsBySite = useMemo(() => {
    return filteredPanels.reduce((acc, panel) => {
      const siteName =
        getDisplaySiteName(panel) || sites?.find((s) => s.id === panel.site_id)?.name || 'Unknown Site';
      if (!acc[siteName]) {
        acc[siteName] = [];
      }
      acc[siteName].push(panel);
      return acc;
    }, {} as Record<string, Panel[]>);
  }, [filteredPanels, sites]);

  const panelAnomalies = useMemo(() => {
    const map = new Map<string, PanelAnomaly[]>();

    (faults || []).forEach((fault) => {
      const confidence = normalizeAnomalyConfidence('ML', fault.fault_type, fault.confidence);
      const severity = getAnomalySeverity('ML', fault.fault_type, confidence);

      const item: PanelAnomaly = {
        id: `ml-${fault.id}`,
        source: 'ML',
        type: fault.fault_type,
        severity,
        message: `ML detected ${fault.fault_type} (${
          confidence != null ? `${formatAnomalyConfidence(confidence)} confidence` : 'No confidence'
        })`,
        detected_at: fault.detected_at,
      };

      const existing = map.get(fault.panel_id) || [];
      existing.push(item);
      map.set(fault.panel_id, existing);
    });

    (cvAnomalies || []).forEach((anomaly) => {
      const confidence = normalizeAnomalyConfidence('CV', anomaly.defect_type, anomaly.confidence);
      const severity = getAnomalySeverity('CV', anomaly.defect_type, confidence);

      const item: PanelAnomaly = {
        id: `cv-${anomaly.id}`,
        source: 'CV',
        type: anomaly.defect_type,
        severity,
        message: `CV detected ${anomaly.defect_type} (${
          confidence != null ? `${formatAnomalyConfidence(confidence)} confidence` : 'No confidence'
        })`,
        detected_at: anomaly.inspected_at,
      };

      const existing = map.get(anomaly.panel_id) || [];
      existing.push(item);
      map.set(anomaly.panel_id, existing);
    });

    map.forEach((list, panelId) => {
      list.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
      map.set(panelId, list);
    });

    return map;
  }, [faults, cvAnomalies]);

  const { data: latestTelemetry, isLoading: telemetryLoading } = useQuery({
    queryKey: ['panel-latest-telemetry', selectedPanel?.id],
    enabled: !!selectedPanel?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('telemetry')
        .select('voltage,current,temperature,light,timestamp')
        .eq('panel_id', selectedPanel!.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        power: data.voltage * data.current,
      };
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Panel Health Overview
            </CardTitle>
            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger className="h-10 w-full sm:w-[180px]">
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full sm:w-[160px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="FAULT">Fault</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {panelsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">Showing {filteredPanels.length} active panels from database.</p>
              {Object.entries(panelsBySite).map(([siteName, sitePanels]) => (
                <div key={siteName}>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {siteName}
                  </h4>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                    {sitePanels.map((panel) => {
                      const displayPanelName = getDisplayPanelName(panel);
                      const shortLabel = displayPanelName.replace(/^panel\s+/i, '');
                      return (
                        <button
                          key={panel.id}
                          onClick={() => setSelectedPanel(panel)}
                          className={`
                            flex aspect-square min-h-12 items-center justify-center rounded-md text-xs font-medium text-primary-foreground shadow-sm transition-all duration-200
                            ${statusColors[panel.status]}
                            hover:scale-105 hover:shadow-md
                            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                          `}
                          title={`${displayPanelName} - ${panel.status}`}
                          aria-label={`Open ${displayPanelName} details`}
                        >
                          <span className="max-w-full truncate px-1">{shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredPanels.length === 0 && (
                <p className="text-sm text-muted-foreground">No panels match current filters.</p>
              )}
            </div>
          )}

          <PanelStatusLegend onSelectStatus={setSelectedStatusInfo} />
        </CardContent>
      </Card>

      <Dialog open={!!selectedPanel} onOpenChange={() => setSelectedPanel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="break-words">{getDisplayPanelName(selectedPanel)}</span>
              {selectedPanel && (
                <button
                  type="button"
                  onClick={() => setSelectedStatusInfo(selectedPanel.status)}
                  className="w-fit"
                  aria-label={`Explain ${selectedPanel.status.toLowerCase()} status`}
                >
                  <Badge variant={panelStatusBadgeVariants[selectedPanel.status]}>
                    {selectedPanel.status}
                  </Badge>
                </button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedPanel && (
            <div className="space-y-4">
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Panel Name</p>
                  <p className="break-words font-medium">{getDisplayPanelName(selectedPanel)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Site Name</p>
                  <p className="break-words font-medium">{getDisplaySiteName(selectedPanel)}</p>
                </div>
              </div>

              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Panel ID</p>
                  <p className="font-mono text-xs break-all">{selectedPanel.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Serial Number</p>
                  <p className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{selectedPanel.serial_number || 'N/A'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-accent" />
                  Latest Telemetry
                </h4>

                {telemetryLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : latestTelemetry ? (
                  <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.power.toFixed(2)}W</p>
                      <p className="text-xs text-muted-foreground">Power</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.voltage.toFixed(2)}V</p>
                      <p className="text-xs text-muted-foreground">Voltage</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.temperature.toFixed(2)}C</p>
                      <p className="text-xs text-muted-foreground">Temp</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.light.toFixed(2)}lx</p>
                      <p className="text-xs text-muted-foreground">Light</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No telemetry available for this panel.</p>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Latest Anomalies
                </h4>
                <div className="touch-scroll space-y-2 overflow-auto">
                  {(panelAnomalies.get(selectedPanel.id) || []).slice(0, 5).map((anomaly) => (
                    <div key={anomaly.id} className="rounded-lg border border-warning/20 bg-warning/10 p-2 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">{anomaly.type}</span>
                        <Badge variant="outline" className="w-fit text-xs">{anomaly.source} - {anomaly.severity}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{anomaly.message}</p>
                    </div>
                  ))}
                  {(panelAnomalies.get(selectedPanel.id) || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No anomalies recorded for this panel.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PanelStatusExplanationDialog
        status={selectedStatusInfo}
        open={!!selectedStatusInfo}
        onOpenChange={(open) => !open && setSelectedStatusInfo(null)}
      />
    </>
  );
}
