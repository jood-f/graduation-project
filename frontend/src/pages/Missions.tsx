import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Clock, CheckCircle, Eye, Plus, Upload } from 'lucide-react';
import { useSites } from '@/hooks/useSites';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMissions,
  useUpdateMissionStatus,
  type Mission,
} from '@/hooks/useMissions';
import { MissionDetailDialog } from '@/components/missions/MissionDetailDialog';
import { CreateMissionDialog } from '@/components/missions/CreateMissionDialog';
import { MissionImageUpload } from '@/components/missions/MissionImageUpload';

type MissionStatus = 'OPEN' | 'COMPLETED';

const statusStyles: Record<MissionStatus, string> = {
  OPEN: 'bg-info/10 text-info border-info/20',
  COMPLETED: 'bg-success/10 text-success border-success/20',
};

const statusIcons: Record<MissionStatus, React.ElementType> = {
  OPEN: Clock,
  COMPLETED: CheckCircle,
};

export default function Missions() {
  const { hasRole } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [uploadMission, setUploadMission] = useState<Mission | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: missions, isLoading } = useMissions();
  const { data: sites } = useSites();
  const updateStatusMutation = useUpdateMissionStatus();

  const canManage = hasRole(['admin', 'operator']);

  const filteredMissions = useMemo(() => {
    if (!missions) return [];

    return missions.filter(mission => {
      const matchesStatus =
        statusFilter === 'all' || mission.status === statusFilter;

      const matchesSite =
        siteFilter === 'all' ||
        mission.site_name === sites?.find(s => s.id === siteFilter)?.name;

      return matchesStatus && matchesSite;
    });
  }, [missions, statusFilter, siteFilter, sites]);

  const handleCompleteMission = (mission: Mission) => {
    updateStatusMutation.mutate({
      missionId: mission.id,
      status: 'COMPLETED',
    });
  };

  return (
    <MainLayout title="Inspections">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle>
              All Inspections ({filteredMissions.length})
            </CardTitle>

            <div className="grid w-full gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap">
              {canManage && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="w-full sm:col-span-2 xl:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Inspection
                </Button>
              )}

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites?.map(site => (
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
            <>
              <div className="space-y-4 md:hidden">
                {filteredMissions.map(mission => {
                  const StatusIcon =
                    statusIcons[mission.status as MissionStatus] || Clock;
                  const canUploadImages = mission.status !== 'COMPLETED';

                  return (
                    <div
                      key={mission.id}
                      className="space-y-4 rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {mission.panel_label}
                          </p>
                          <p className="text-xs font-mono text-muted-foreground">
                            {mission.id}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {mission.site_name}
                          </p>
                        </div>

                        <Badge
                          className={cn(
                            'gap-1',
                            statusStyles[mission.status as MissionStatus] || ''
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {mission.status}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        Created {new Date(mission.created_at).toLocaleDateString()}
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {canUploadImages && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUploadMission(mission)}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </Button>
                        )}

                        {mission.status === 'OPEN' && canManage && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCompleteMission(mission)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Complete
                          </Button>
                        )}

                        {mission.image_count > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedMission(mission)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table className="min-w-[52rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inspection ID</TableHead>
                      <TableHead>Panel</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredMissions.map(mission => {
                      const StatusIcon =
                        statusIcons[mission.status as MissionStatus] || Clock;
                      const canUploadImages = mission.status !== 'COMPLETED';

                      return (
                        <TableRow key={mission.id}>
                          <TableCell className="font-mono text-sm">
                            {mission.id.slice(0, 12)}...
                          </TableCell>

                          <TableCell className="font-medium">
                            {mission.panel_label}
                          </TableCell>

                          <TableCell>{mission.site_name}</TableCell>

                          <TableCell>
                            <Badge
                              className={cn(
                                'gap-1',
                                statusStyles[mission.status as MissionStatus] || ''
                              )}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {mission.status}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(mission.created_at).toLocaleDateString()}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {canUploadImages && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Upload inspection images"
                                  aria-label={`Upload images for inspection ${mission.id}`}
                                  onClick={() => setUploadMission(mission)}
                                >
                                  <Upload className="h-4 w-4" />
                                </Button>
                              )}

                              {mission.status === 'OPEN' && canManage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCompleteMission(mission)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}

                              {mission.image_count > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedMission(mission)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {!isLoading && filteredMissions.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No inspections found matching your criteria
            </p>
          )}
        </CardContent>
      </Card>

      <MissionDetailDialog
        mission={selectedMission}
        open={!!selectedMission}
        canDeleteImages={canManage}
        onOpenChange={(open) => !open && setSelectedMission(null)}
      />

      <CreateMissionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {uploadMission && (
        <MissionImageUpload
          missionId={uploadMission.id}
          missionLabel={`${uploadMission.panel_label} - ${uploadMission.site_name}`}
          open={!!uploadMission}
          onOpenChange={(open) => {
            if (!open) {
              setUploadMission(null);
            }
          }}
        />
      )}
    </MainLayout>
  );
}
