import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Filter } from 'lucide-react';
import { usePanels, type Panel } from '@/hooks/usePanels';
import { useSites } from '@/hooks/useSites';
import { supabase } from '@/integrations/supabase/client';
import type { PanelStatus } from '@/types';
import {
  PanelStatusExplanationDialog,
  panelStatusStyles,
} from '@/components/panels/PanelStatusInfo';
import { cn } from '@/lib/utils';

const missionStatusStyles: Record<string, string> = {
  OPEN: 'bg-info/10 text-info border-info/20',
  COMPLETED: 'bg-success/10 text-success border-success/20',
};

const RECORDS_PER_PAGE = 4;

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

interface PanelTelemetryRecord {
  id: string;
  voltage: number;
  current: number;
  temperature: number;
  timestamp: string;
  light: number | null;
  power: number;
}

interface DetailFieldProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

function DetailField({ label, value, valueClassName }: DetailFieldProps) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn('break-words text-sm font-medium text-foreground', valueClassName)}>{value}</div>
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: ReactNode;
}

function SummaryStat({ label, value }: SummaryStatProps) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-2xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function formatMissionStatus(status: string) {
  if (status === 'OPEN') return 'Open';
  if (status === 'COMPLETED') return 'Completed';
  return status.replace('_', ' ');
}

function TelemetryRecordCard({ record }: { record: PanelTelemetryRecord }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recorded</p>
        <p className="text-sm font-medium">{new Date(record.timestamp).toLocaleString()}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailField label="Power" value={`${record.power.toFixed(2)} W`} />
        <DetailField label="Voltage" value={`${record.voltage.toFixed(2)} V`} />
        <DetailField label="Current" value={`${record.current.toFixed(2)} A`} />
        <DetailField label="Temperature" value={`${record.temperature.toFixed(2)} deg C`} />
        <DetailField
          label="Light"
          value={record.light != null ? `${record.light.toFixed(2)} lx` : 'N/A'}
        />
      </div>
    </div>
  );
}

export default function Panels() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
  const [selectedStatusInfo, setSelectedStatusInfo] = useState<PanelStatus | null>(null);
  const [detailsTab, setDetailsTab] = useState('overview');
  const [recordPage, setRecordPage] = useState(1);
  const requestedPanelId = searchParams.get('panel');

  const { data: panels, isLoading: panelsLoading } = usePanels();
  const { data: sites } = useSites();

  useEffect(() => {
    if (!requestedPanelId || !panels?.length) return;

    const matchedPanel = panels.find((panel) => panel.id === requestedPanelId);
    if (matchedPanel) {
      setSelectedPanel((current) => (current?.id === matchedPanel.id ? current : matchedPanel));
    }
  }, [requestedPanelId, panels]);

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

  const { data: panelRecords, isLoading: recordsLoading } = useQuery({
    queryKey: ['panel-telemetry-records', selectedPanel?.id],
    enabled: !!selectedPanel?.id,
    queryFn: async (): Promise<PanelTelemetryRecord[]> => {
      const { data, error } = await (supabase as any)
        .from('telemetry')
        .select('id,voltage,current,temperature,timestamp,light')
        .eq('panel_id', selectedPanel!.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      return ((data as Omit<PanelTelemetryRecord, 'power'>[]) || []).map((record) => ({
        ...record,
        power: record.voltage * record.current,
      }));
    },
  });

  const totalRecordPages = Math.max(
    1,
    Math.ceil((panelRecords?.length ?? 0) / RECORDS_PER_PAGE)
  );

  const pagedRecords = useMemo(() => {
    const start = (recordPage - 1) * RECORDS_PER_PAGE;
    return (panelRecords || []).slice(start, start + RECORDS_PER_PAGE);
  }, [panelRecords, recordPage]);

  useEffect(() => {
    if (selectedPanel?.id) {
      setDetailsTab('overview');
      setRecordPage(1);
    }
  }, [selectedPanel?.id]);

  useEffect(() => {
    setRecordPage((currentPage) => Math.min(currentPage, totalRecordPages));
  }, [totalRecordPages]);

  const openPanelDetails = (panel: Panel) => {
    setSelectedPanel(panel);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('panel', panel.id);
      return next;
    });
  };

  const closePanelDetails = () => {
    setSelectedPanel(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('panel');
      return next;
    }, { replace: true });
  };

  return (
    <MainLayout title="Panels">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle>All Panels ({filteredPanels.length})</CardTitle>
            <div className="grid w-full gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap">
              <div className="relative sm:col-span-2 xl:w-[240px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search panels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9"
                />
              </div>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <SelectTrigger className="w-full sm:w-[160px]">
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
            <>
              <div className="space-y-4 md:hidden">
                {filteredPanels.map((panel) => (
                  <div key={panel.id} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{panel.label || 'N/A'}</p>
                        <p className="break-all text-sm text-muted-foreground">{panel.serial_number || 'N/A'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedStatusInfo(panel.status)}
                        className="w-fit"
                        aria-label={`Explain ${panel.status.toLowerCase()} status`}
                      >
                        <Badge className={cn(panelStatusStyles[panel.status])}>{panel.status}</Badge>
                      </button>
                    </div>
                    <div className="text-sm">
                      <p className="text-muted-foreground">Site</p>
                      <p>{panel.site_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openPanelDetails(panel)}
                      aria-label={`Open details for panel ${panel.label || panel.id}`}
                    >
                      Details
                    </Button>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table className="min-w-[48rem]">
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
                        <TableCell className="break-all text-muted-foreground">{panel.serial_number || 'N/A'}</TableCell>
                        <TableCell>{panel.site_name}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setSelectedStatusInfo(panel.status)}
                            className="w-fit"
                            aria-label={`Explain ${panel.status.toLowerCase()} status`}
                          >
                            <Badge className={cn(panelStatusStyles[panel.status])}>{panel.status}</Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPanelDetails(panel)}
                            aria-label={`Open details for panel ${panel.label || panel.id}`}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {!panelsLoading && filteredPanels.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No panels found matching your criteria</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedPanel} onOpenChange={(open) => !open && closePanelDetails()}>
        <DialogContent className="h-[min(92svh,900px)] w-[min(96vw,1100px)] max-w-none gap-0 overflow-hidden p-0">
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="shrink-0 px-4 py-4 pr-10 sm:px-6 sm:py-5 sm:pr-12">
              <DialogTitle>Panel Details</DialogTitle>
              <DialogDescription>
                Complete information for {selectedPanel?.label || selectedPanel?.id}
              </DialogDescription>
            </DialogHeader>

            {selectedPanel && (
              <Tabs
                value={detailsTab}
                onValueChange={setDetailsTab}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="shrink-0 px-4 pb-3 sm:px-6">
                  <TabsList className="grid h-auto w-full grid-cols-3">
                    <TabsTrigger value="overview" className="px-2 py-2 text-xs sm:text-sm">Overview</TabsTrigger>
                    <TabsTrigger value="activity" className="px-2 py-2 text-xs sm:text-sm">Activity</TabsTrigger>
                    <TabsTrigger value="records" className="px-2 py-2 text-xs sm:text-sm">Records</TabsTrigger>
                  </TabsList>
                </div>

                <div className="touch-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6">
                  <TabsContent value="overview" className="mt-0 h-full">
                    <div className="space-y-4">
                      <section className="space-y-3">
                        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Selected Panel</p>
                            <h3 className="text-lg font-semibold">{selectedPanel.label || 'Unnamed Panel'}</h3>
                            <p className="text-sm text-muted-foreground">{selectedPanel.site_name || 'Unknown Site'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedStatusInfo(selectedPanel.status)}
                            className="w-fit"
                            aria-label={`Explain ${selectedPanel.status.toLowerCase()} status`}
                          >
                            <Badge className={cn('w-fit', panelStatusStyles[selectedPanel.status])}>
                              {selectedPanel.status}
                            </Badge>
                          </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <DetailField
                            label="Panel ID"
                            value={selectedPanel.id}
                            valueClassName="font-mono text-[13px] break-all"
                          />
                          <DetailField
                            label="Status"
                            value={
                              <button
                                type="button"
                                onClick={() => setSelectedStatusInfo(selectedPanel.status)}
                                className="w-fit"
                                aria-label={`Explain ${selectedPanel.status.toLowerCase()} status`}
                              >
                                <Badge className={cn(panelStatusStyles[selectedPanel.status])}>
                                  {selectedPanel.status}
                                </Badge>
                              </button>
                            }
                          />
                          <DetailField label="Panel Label" value={selectedPanel.label || 'Not available'} />
                          <DetailField label="Serial Number" value={selectedPanel.serial_number || 'Not available'} />
                          <DetailField
                            label="Site ID"
                            value={selectedPanel.site_id}
                            valueClassName="font-mono text-[13px] break-all"
                          />
                          <DetailField label="Site Name" value={selectedPanel.site_name || 'Unknown Site'} />
                        </div>
                      </section>
                    </div>
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0 h-full">
                    <section className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold">Activity Summary</h4>
                        <p className="text-sm text-muted-foreground">
                          Recent operational data and related records for this panel.
                        </p>
                      </div>

                      {detailsLoading ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                          </div>
                          <Skeleton className="h-32 w-full" />
                          <Skeleton className="h-24 w-full" />
                        </div>
                      ) : panelDetails ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <SummaryStat label="Telemetry Records" value={panelDetails.telemetry_count} />
                            <SummaryStat label="Fault Records" value={panelDetails.faults_count} />
                            <SummaryStat label="Inspections" value={panelDetails.missions_count} />
                          </div>

                          <div className="space-y-3 rounded-lg border p-4">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <h5 className="text-sm font-semibold">Latest Telemetry</h5>
                              {panelDetails.latest_telemetry && (
                                <p className="text-xs text-muted-foreground">
                                  Recorded {new Date(panelDetails.latest_telemetry.timestamp).toLocaleString()}
                                </p>
                              )}
                            </div>

                            {panelDetails.latest_telemetry ? (
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <DetailField label="Power" value={`${panelDetails.latest_telemetry.power.toFixed(2)} W`} />
                                <DetailField label="Voltage" value={`${panelDetails.latest_telemetry.voltage.toFixed(2)} V`} />
                                <DetailField label="Current" value={`${panelDetails.latest_telemetry.current.toFixed(2)} A`} />
                                <DetailField label="Temperature" value={`${panelDetails.latest_telemetry.temperature.toFixed(2)} deg C`} />
                                <DetailField label="Light" value={`${panelDetails.latest_telemetry.light.toFixed(2)} lx`} />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No telemetry data available.</p>
                            )}
                          </div>

                          <div className="space-y-3 rounded-lg border p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <h5 className="text-sm font-semibold">Latest Inspection</h5>
                              {panelDetails.latest_mission && (
                                <Badge className={cn(missionStatusStyles[panelDetails.latest_mission.status] || 'border-input')}>
                                  {formatMissionStatus(panelDetails.latest_mission.status)}
                                </Badge>
                              )}
                            </div>

                            {panelDetails.latest_mission ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <DetailField
                                  label="Inspection ID"
                                  value={panelDetails.latest_mission.id}
                                  valueClassName="font-mono text-[13px] break-all"
                                />
                                <DetailField
                                  label="Created"
                                  value={new Date(panelDetails.latest_mission.created_at).toLocaleString()}
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No inspections available.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No extra details available.</p>
                      )}
                    </section>
                  </TabsContent>

                  <TabsContent value="records" className="mt-0 h-full">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <h5 className="text-sm font-semibold">Panel Records</h5>
                          <p className="text-sm text-muted-foreground">
                            Telemetry history for this panel.
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit">
                          {panelDetails?.telemetry_count || 0} records
                        </Badge>
                      </div>

                      {recordsLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-28 w-full" />
                          <Skeleton className="h-28 w-full" />
                          <Skeleton className="h-28 w-full" />
                        </div>
                      ) : pagedRecords.length > 0 ? (
                        <>
                          <div className="grid gap-3 xl:grid-cols-2">
                            {pagedRecords.map((record) => (
                              <TelemetryRecordCard key={record.id} record={record} />
                            ))}
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t pt-3">
                            <p className="text-sm text-muted-foreground">
                              Page {recordPage} of {totalRecordPages}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecordPage((page) => Math.max(1, page - 1))}
                                disabled={recordPage === 1}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecordPage((page) => Math.min(totalRecordPages, page + 1))}
                                disabled={recordPage === totalRecordPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No telemetry records available for this panel.</p>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            )}

            <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <PanelStatusExplanationDialog
        status={selectedStatusInfo}
        open={!!selectedStatusInfo}
        onOpenChange={(open) => !open && setSelectedStatusInfo(null)}
      />
    </MainLayout>
  );
}
