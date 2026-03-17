import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Filter } from 'lucide-react';
import { usePanels, type Panel } from '@/hooks/usePanels';
import { useSites } from '@/hooks/useSites';
import { supabase } from '@/integrations/supabase/client';
import type { PanelStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusStyles: Record<PanelStatus, string> = {
  OK: 'bg-success/10 text-success border-success/20',
  WARNING: 'bg-warning/10 text-warning border-warning/20',
  FAULT: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface PanelDetailsData {
  telemetry_count: number;
  latest_telemetry: {
    voltage: number;
    current: number;
    temperature: number;
    timestamp: string;
    power: number;
    light: number;
  } | null;
  faults_count: number;
  missions_count: number;
  latest_mission: {
    id: string;
    status: string;
    created_at: string;
  } | null;
}

export default function Panels() {
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);

  const { data: panels, isLoading: panelsLoading } = usePanels();
  const { data: sites } = useSites();

  const filteredPanels = useMemo(() => {
    if (!panels) return [];
    return panels.filter((panel) => {
      const matchesSearch =
        (panel.label || '').toLowerCase().includes(search.toLowerCase()) ||
        (panel.serial_number || '').toLowerCase().includes(search.toLowerCase()) ||
        panel.id.toLowerCase().includes(search.toLowerCase());
      const matchesSite = siteFilter === 'all' || panel.site_id === siteFilter;
      const matchesStatus = statusFilter === 'all' || panel.status === statusFilter;
      return matchesSearch && matchesSite && matchesStatus;
    });
  }, [panels, search, siteFilter, statusFilter]);

  const { data: panelDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['panel-details', selectedPanel?.id],
    enabled: !!selectedPanel?.id,
    queryFn: async (): Promise<PanelDetailsData> => {
      const panelId = selectedPanel!.id;

      const [telemetryLatestRes, telemetryCountRes, faultsCountRes, missionsRes] = await Promise.all([
        (supabase as any)
          .from('telemetry')
          .select('voltage,current,temperature,timestamp,light')
          .eq('panel_id', panelId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('telemetry')
          .select('id', { count: 'exact', head: true })
          .eq('panel_id', panelId),
        (supabase as any)
          .from('faults')
          .select('id', { count: 'exact', head: true })
          .eq('panel_id', panelId),
        (supabase as any)
          .from('missions')
          .select('id,status,created_at')
          .eq('panel_id', panelId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (telemetryLatestRes.error) throw telemetryLatestRes.error;
      if (telemetryCountRes.error) throw telemetryCountRes.error;
      if (faultsCountRes.error) throw faultsCountRes.error;
      if (missionsRes.error) throw missionsRes.error;

      const latestTelemetry = telemetryLatestRes.data
        ? {
            ...telemetryLatestRes.data,
            power: telemetryLatestRes.data.voltage * telemetryLatestRes.data.current,
            light: telemetryLatestRes.data.light,
          }
        : null;

      return {
        telemetry_count: telemetryCountRes.count || 0,
        latest_telemetry: latestTelemetry,
        faults_count: faultsCountRes.count || 0,
        missions_count: missionsRes.data?.length || 0,
        latest_mission: missionsRes.data?.[0] || null,
      };
    },
  });

  return (
    <MainLayout title="Panels">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Panels ({filteredPanels.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search panels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
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
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPanels.map((panel) => (
                  <TableRow key={panel.id}>
                    <TableCell className="font-medium">{panel.label || 'N/A'}</TableCell>
                    <TableCell className="text-muted-foreground">{panel.serial_number || 'N/A'}</TableCell>
                    <TableCell>{panel.site_name}</TableCell>
                    <TableCell>
                      <Badge className={cn(statusStyles[panel.status])}>{panel.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPanel(panel)}
                        aria-label={`Open details for panel ${panel.label || panel.id}`}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!panelsLoading && filteredPanels.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No panels found matching your criteria</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedPanel} onOpenChange={(open) => !open && setSelectedPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Panel Details</DialogTitle>
            <DialogDescription>
              Complete information for {selectedPanel?.label || selectedPanel?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedPanel && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Panel ID</p>
                  <p className="font-mono break-all">{selectedPanel.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={cn(statusStyles[selectedPanel.status])}>{selectedPanel.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Label</p>
                  <p>{selectedPanel.label || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Serial Number</p>
                  <p>{selectedPanel.serial_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Site ID</p>
                  <p className="font-mono break-all">{selectedPanel.site_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Site Name</p>
                  <p>{selectedPanel.site_name || 'Unknown Site'}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="font-medium mb-2">Extra Data by Panel ID</h4>
                {detailsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : panelDetails ? (
                  <div className="space-y-2">
                    <p>Telemetry records: <span className="font-medium">{panelDetails.telemetry_count}</span></p>
                    <p>Fault records: <span className="font-medium">{panelDetails.faults_count}</span></p>
                    <p>Missions: <span className="font-medium">{panelDetails.missions_count}</span></p>
                    <div>
                      <p className="text-muted-foreground">Latest telemetry</p>
                      {panelDetails.latest_telemetry ? (
                        <>
                          <p>
                            {panelDetails.latest_telemetry.power.toFixed(2)} W | {panelDetails.latest_telemetry.voltage.toFixed(2)} V | {panelDetails.latest_telemetry.current.toFixed(2)} A | {panelDetails.latest_telemetry.temperature.toFixed(2)} °C | {panelDetails.latest_telemetry.light.toFixed(2)} lx
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Recorded at: {new Date(panelDetails.latest_telemetry.timestamp).toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p>No telemetry data available.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Latest mission</p>
                      {panelDetails.latest_mission ? (
                        <p>
                          {panelDetails.latest_mission.id} | {panelDetails.latest_mission.status} | {new Date(panelDetails.latest_mission.created_at).toLocaleString()}
                        </p>
                      ) : (
                        <p>No missions available.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No extra details available.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
