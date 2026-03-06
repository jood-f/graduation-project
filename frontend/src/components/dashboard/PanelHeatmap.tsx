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
import { Activity, AlertTriangle, MapPin, Zap, Filter } from 'lucide-react';

const statusColors: Record<string, string> = {
  OK: 'bg-primary hover:bg-primary/80',
  WARNING: 'bg-warning hover:bg-warning/80',
  FAULT: 'bg-destructive hover:bg-destructive/80',
};

const statusBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OK: 'default',
  WARNING: 'secondary',
  FAULT: 'destructive',
};

type PanelAnomaly = {
  id: string;
  source: 'ML' | 'CV';
  type: string;
  severity: 'LOW' | 'MED' | 'HIGH';
  message: string;
  detected_at: string;
};

export function PanelHeatmap() {
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
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
      const siteName = panel.site_name || sites?.find((s) => s.id === panel.site_id)?.name || 'Unknown Site';
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
      const severity: 'LOW' | 'MED' | 'HIGH' =
        fault.confidence >= 0.85 ? 'HIGH' : fault.confidence >= 0.7 ? 'MED' : 'LOW';

      const item: PanelAnomaly = {
        id: `ml-${fault.id}`,
        source: 'ML',
        type: fault.fault_type,
        severity,
        message: `ML detected ${fault.fault_type} (${Math.round(fault.confidence * 100)}% confidence)`,
        detected_at: fault.detected_at,
      };

      const existing = map.get(fault.panel_id) || [];
      existing.push(item);
      map.set(fault.panel_id, existing);
    });

    (cvAnomalies || []).forEach((anomaly) => {
      const severity: 'LOW' | 'MED' | 'HIGH' =
        anomaly.confidence >= 0.85 ? 'HIGH' : anomaly.confidence >= 0.7 ? 'MED' : 'LOW';

      const item: PanelAnomaly = {
        id: `cv-${anomaly.id}`,
        source: 'CV',
        type: anomaly.defect_type,
        severity,
        message: `CV detected ${anomaly.defect_type} (${Math.round(anomaly.confidence * 100)}% confidence)`,
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
        .select('voltage,current,temperature,timestamp')
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Panel Health Overview
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[140px] h-8 text-sm">
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
              <SelectTrigger className="w-[120px] h-8 text-sm">
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
        </CardHeader>
        <CardContent>
          {panelsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">Showing {filteredPanels.length} active panels from database.</p>
              {Object.entries(panelsBySite).map(([siteName, sitePanels]) => (
                <div key={siteName}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {siteName}
                  </h4>
                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                    {sitePanels.map((panel) => {
                      const shortLabel = panel.label?.split('-').pop() || panel.label || panel.id.slice(0, 4);
                      return (
                        <button
                          key={panel.id}
                          onClick={() => setSelectedPanel(panel)}
                          className={`
                            aspect-square rounded-md transition-all duration-200
                            ${statusColors[panel.status]}
                            flex items-center justify-center text-xs font-medium
                            text-primary-foreground shadow-sm
                            hover:scale-110 hover:shadow-md
                            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                          `}
                          title={`${panel.label || panel.id} - ${panel.status}`}
                          aria-label={`Open panel ${panel.label || panel.id} details`}
                        >
                          {shortLabel}
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

          <div className="mt-6 flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-primary" />
              <span>OK</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-warning" />
              <span>Warning</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-destructive" />
              <span>Fault</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedPanel} onOpenChange={() => setSelectedPanel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Panel {selectedPanel?.label || selectedPanel?.id}
              {selectedPanel && <Badge variant={statusBadgeVariants[selectedPanel.status]}>{selectedPanel.status}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {selectedPanel && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Panel ID</p>
                  <p className="font-mono text-xs break-all">{selectedPanel.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Site</p>
                  <p className="font-medium">{selectedPanel.site_name || 'Unknown Site'}</p>
                </div>
              </div>

              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">Serial Number</p>
                <p className="font-mono text-xs bg-muted px-2 py-1 rounded">{selectedPanel.serial_number || 'N/A'}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  Latest Telemetry
                </h4>

                {telemetryLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : latestTelemetry ? (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.power.toFixed(2)}W</p>
                      <p className="text-xs text-muted-foreground">Power</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.voltage.toFixed(2)}V</p>
                      <p className="text-xs text-muted-foreground">Voltage</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-primary">{latestTelemetry.temperature.toFixed(2)}C</p>
                      <p className="text-xs text-muted-foreground">Temp</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No telemetry available for this panel.</p>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Latest Anomalies
                </h4>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {(panelAnomalies.get(selectedPanel.id) || []).slice(0, 5).map((anomaly) => (
                    <div key={anomaly.id} className="bg-warning/10 border border-warning/20 rounded-lg p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{anomaly.type}</span>
                        <Badge variant="outline" className="text-xs">{anomaly.source} - {anomaly.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{anomaly.message}</p>
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
    </>
  );
}
