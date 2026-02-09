import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { mockPanels, mockAnomalies, mockTelemetry, mockSites } from '@/data/mockData';
import type { Panel, PanelStatus } from '@/types';
import { format } from 'date-fns';
import { MapPin, Calendar, Activity, AlertTriangle, Zap, Filter } from 'lucide-react';

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

export function PanelHeatmap() {
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredPanels = useMemo(() => {
    return mockPanels.filter((panel) => {
      const matchesSite = siteFilter === 'all' || panel.siteId === siteFilter;
      const matchesStatus = statusFilter === 'all' || panel.status === statusFilter;
      return matchesSite && matchesStatus;
    });
  }, [siteFilter, statusFilter]);

  const getPanelAnomalies = (panelId: string) => {
    return mockAnomalies.filter(a => a.panelId === panelId && a.status === 'OPEN');
  };

  const getLatestTelemetry = (panelId: string) => {
    const telemetry = mockTelemetry[panelId];
    if (!telemetry || telemetry.length === 0) return null;
    return telemetry[telemetry.length - 1];
  };

  // Group filtered panels by site
  const panelsBySite = useMemo(() => {
    return filteredPanels.reduce((acc, panel) => {
      if (!acc[panel.siteName]) {
        acc[panel.siteName] = [];
      }
      acc[panel.siteName].push(panel);
      return acc;
    }, {} as Record<string, Panel[]>);
  }, [filteredPanels]);

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
                  {mockSites.map((site) => (
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
          <div className="space-y-6">
            {Object.entries(panelsBySite).map(([siteName, panels]) => (
              <div key={siteName}>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {siteName}
                </h4>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {panels.map((panel) => (
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
                      title={`${panel.label} - ${panel.status}`}
                    >
                      {panel.label.split('-')[1]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
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

      {/* Panel Detail Dialog */}
      <Dialog open={!!selectedPanel} onOpenChange={() => setSelectedPanel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Panel {selectedPanel?.label}
              {selectedPanel && (
                <Badge variant={statusBadgeVariants[selectedPanel.status]}>
                  {selectedPanel.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedPanel && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Site
                  </p>
                  <p className="font-medium">{selectedPanel.siteName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Installed
                  </p>
                  <p className="font-medium">
                    {format(new Date(selectedPanel.installedAt), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>

              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">Serial Number</p>
                <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {selectedPanel.serialNumber}
                </p>
              </div>

              {/* Latest Telemetry */}
              {(() => {
                const telemetry = getLatestTelemetry(selectedPanel.id);
                if (!telemetry) return null;

                return (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-accent" />
                      Latest Readings
                    </h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-lg font-semibold text-primary">
                          {telemetry.acPower.toFixed(0)}W
                        </p>
                        <p className="text-xs text-muted-foreground">AC Power</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-lg font-semibold text-primary">
                          {telemetry.voltage.toFixed(1)}V
                        </p>
                        <p className="text-xs text-muted-foreground">Voltage</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-lg font-semibold text-primary">
                          {telemetry.temperature.toFixed(1)}°C
                        </p>
                        <p className="text-xs text-muted-foreground">Temp</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Open Anomalies */}
              {(() => {
                const anomalies = getPanelAnomalies(selectedPanel.id);
                if (anomalies.length === 0) return null;

                return (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Open Anomalies ({anomalies.length})
                    </h4>
                    <div className="space-y-2">
                      {anomalies.map((anomaly) => (
                        <div
                          key={anomaly.id}
                          className="bg-warning/10 border border-warning/20 rounded-lg p-2 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{anomaly.type.replace('_', ' ')}</span>
                            <Badge variant="outline" className="text-xs">
                              {anomaly.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {anomaly.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
