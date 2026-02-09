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
import { Plane, Clock, CheckCircle, XCircle, Eye, ThumbsUp, Upload, Play, Plus } from 'lucide-react';
import { mockSites } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMissions, useApproveMission, useUpdateMissionStatus, type Mission } from '@/hooks/useMissions';
import { MissionImageUpload } from '@/components/missions/MissionImageUpload';
import { MissionDetailDialog } from '@/components/missions/MissionDetailDialog';
import { CreateMissionDialog } from '@/components/missions/CreateMissionDialog';

type MissionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_FLIGHT' | 'COMPLETED' | 'CANCELLED';

const statusStyles: Record<MissionStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_APPROVAL: 'bg-warning/10 text-warning border-warning/20',
  APPROVED: 'bg-info/10 text-info border-info/20',
  IN_FLIGHT: 'bg-primary/10 text-primary border-primary/20',
  COMPLETED: 'bg-success/10 text-success border-success/20',
  CANCELLED: 'bg-destructive/10 text-destructive border-destructive/20',
};

const statusIcons: Record<MissionStatus, React.ElementType> = {
  DRAFT: Clock,
  PENDING_APPROVAL: Clock,
  APPROVED: CheckCircle,
  IN_FLIGHT: Plane,
  COMPLETED: CheckCircle,
  CANCELLED: XCircle,
};

export default function Missions() {
  const { hasRole } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [uploadMission, setUploadMission] = useState<Mission | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: missions, isLoading } = useMissions();
  const approveMutation = useApproveMission();
  const updateStatusMutation = useUpdateMissionStatus();

  // Drone team and admin can approve missions
  const canApprove = hasRole(['admin', 'drone_team']);
  // Only drone_team can upload images (after they approved and mission is in flight or completed)
  const canUploadImages = hasRole(['admin', 'drone_team']);
  // Operators and admins can create missions
  const canCreateMission = hasRole(['admin', 'operator']);

  const filteredMissions = useMemo(() => {
    if (!missions) return [];
    return missions.filter(mission => {
      const matchesStatus = statusFilter === 'all' || mission.status === statusFilter;
      const matchesSite = siteFilter === 'all' || mission.site_name === mockSites.find(s => s.id === siteFilter)?.name;
      return matchesStatus && matchesSite;
    });
  }, [missions, statusFilter, siteFilter]);

  const handleApprove = (mission: Mission) => {
    approveMutation.mutate(mission.id);
  };

  const handleStartFlight = (mission: Mission) => {
    updateStatusMutation.mutate({ missionId: mission.id, status: 'IN_FLIGHT' });
  };

  const handleCompleteMission = (mission: Mission) => {
    updateStatusMutation.mutate({ missionId: mission.id, status: 'COMPLETED' });
  };

  return (
    <MainLayout title="Drone Missions">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Missions ({filteredMissions.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              {canCreateMission && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Mission
                </Button>
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="IN_FLIGHT">In Flight</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {mockSites.map(site => (
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
                  <TableHead>Mission ID</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMissions.map(mission => {
                  const StatusIcon = statusIcons[mission.status as MissionStatus] || Clock;
                  return (
                    <TableRow key={mission.id}>
                      <TableCell className="font-mono text-sm">
                        {mission.id.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="font-medium">{mission.panel_label}</TableCell>
                      <TableCell>{mission.site_name}</TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', statusStyles[mission.status as MissionStatus] || '')}>
                          <StatusIcon className="h-3 w-3" />
                          {mission.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {mission.approved_by_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(mission.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* Approve button - only for PENDING_APPROVAL and drone_team/admin */}
                          {mission.status === 'PENDING_APPROVAL' && canApprove && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Approve Mission"
                              onClick={() => handleApprove(mission)}
                              disabled={approveMutation.isPending}
                            >
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Start Flight button - only for APPROVED and drone_team/admin */}
                          {mission.status === 'APPROVED' && canApprove && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Start Flight"
                              onClick={() => handleStartFlight(mission)}
                              disabled={updateStatusMutation.isPending}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Complete & Upload button - only for IN_FLIGHT and drone_team/admin */}
                          {mission.status === 'IN_FLIGHT' && canUploadImages && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Complete Mission"
                                onClick={() => handleCompleteMission(mission)}
                                disabled={updateStatusMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Upload Images"
                                onClick={() => setUploadMission(mission)}
                              >
                                <Upload className="h-4 w-4" />
                              </Button>
                            </>
                          )}

                          {/* Upload button for COMPLETED missions - drone_team/admin can still add more images */}
                          {mission.status === 'COMPLETED' && canUploadImages && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Upload Images"
                              onClick={() => setUploadMission(mission)}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          )}

                          {/* View button - everyone */}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View Details"
                            onClick={() => setSelectedMission(mission)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!isLoading && filteredMissions.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No missions found matching your criteria
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mission Detail Dialog */}
      <MissionDetailDialog
        mission={selectedMission}
        open={!!selectedMission}
        onOpenChange={(open) => !open && setSelectedMission(null)}
      />

      {/* Image Upload Dialog */}
      {uploadMission && (
        <MissionImageUpload
          missionId={uploadMission.id}
          missionLabel={uploadMission.panel_label}
          open={!!uploadMission}
          onOpenChange={(open) => !open && setUploadMission(null)}
        />
      )}

      {/* Create Mission Dialog */}
      <CreateMissionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </MainLayout>
  );
}
