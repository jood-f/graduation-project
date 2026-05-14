import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDeleteMissionImage,
  useMissionImages,
  type Mission,
} from '@/hooks/useMissions';
import { DefectAnalysis } from '@/components/missions/DefectAnalysis';
import {
  AlertTriangle,
  Image as ImageIcon,
  ScanEye,
  Terminal,
  RefreshCw,
  Zap,
  LayoutGrid,
  XCircle,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const missionStatusStyles: Record<string, string> = {
  OPEN: 'bg-info/10 text-info border-info/20',
  COMPLETED: 'bg-success/10 text-success border-success/20',
};

export const AIAnalysisContent = ({
  detections = [],
  rawImage,
  onReanalyze,
}) => {
  const [showDebug, setShowDebug] = useState(false);

  const hasDefects = detections.length > 0;
  const status = hasDefects ? 'CRITICAL' : 'OK';

  const avgConfidence =
    detections.length > 0
      ? Math.round(
          (detections.reduce((acc, d) => acc + (d.confidence || 0), 0) /
            detections.length) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row gap-4">

        <Card className="flex-1 bg-muted/20 border border-border">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                Analysis Result
              </p>
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    'h-5 w-5',
                    hasDefects ? 'text-red-500' : 'text-green-500'
                  )}
                />
                <h3
                  className={cn(
                    'text-xl font-bold',
                    hasDefects ? 'text-red-500' : 'text-green-500'
                  )}
                >
                  {status}
                </h3>
              </div>
            </div>

            <div className="text-right">
              <Badge
                className={cn(
                  hasDefects
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-green-500/10 text-green-500'
                )}
              >
                {detections.length} Defects
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">
                ~{avgConfidence}% confidence
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-[2] bg-primary/5 border border-border">
          <CardContent className="pt-6 flex gap-3">
            <div
              className={cn(
                'p-2 rounded-full',
                hasDefects ? 'bg-red-500/10' : 'bg-blue-500/10'
              )}
            >
              <Zap
                className={cn(
                  'h-4 w-4',
                  hasDefects ? 'text-red-500' : 'text-blue-500'
                )}
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Recommended Action
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasDefects
                  ? 'High priority inspection required. Schedule maintenance.'
                  : 'No issues detected. Continue regular monitoring.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          Detected Defects
        </div>

        {detections.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg">
            No defects detected
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {detections.map((d, i) => (
              <div
                key={i}
                className="border rounded-lg p-4 bg-card hover:border-red-400 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{d.class}</p>
                    <p className="text-xs text-muted-foreground">
                      Location: {JSON.stringify(d.location || [0, 0])}
                    </p>
                  </div>

                  <Badge
                    className="bg-yellow-500/10 text-yellow-500 text-[10px]"
                  >
                    {Math.round((d.confidence || 0) * 100)}%
                  </Badge>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full text-xs text-muted-foreground hover:text-red-500"
                >
                  <XCircle className="h-3 w-3 mr-2" />
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            <Terminal className="h-3 w-3" />
            Debug Console
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onReanalyze}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-run
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs"
            >
              {showDebug ? 'Hide' : 'Show'}
            </Button>
          </div>
        </div>

        {showDebug && (
          <div className="border rounded-lg bg-black/40 p-4 text-xs font-mono space-y-2">
            <p className="text-muted-foreground">YOLOv8 Output</p>

            {detections.map((d, i) => (
              <div key={i} className="border-b border-white/10 pb-2">
                <p>{d.class}</p>
                <p>confidence: {d.confidence}</p>
                <p>{JSON.stringify(d.location)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        YOLOv8 Solar Panel Defect Detection
      </p>
    </div>
  );
};

interface MissionDetailDialogProps {
  mission: Mission | null;
  open: boolean;
  canDeleteImages: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionDetailDialog({
  mission,
  open,
  canDeleteImages,
  onOpenChange,
}: MissionDetailDialogProps) {
  const { data: images, isLoading: imagesLoading } = useMissionImages(
    mission?.id ?? null
  );
  const deleteMutation = useDeleteMissionImage();

  if (!mission) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Inspection Details</DialogTitle>
          <DialogDescription>
            Inspection for panel {mission.panel_label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <Badge
                className={cn(
                  'ml-2',
                  missionStatusStyles[mission.status] || missionStatusStyles.OPEN
                )}
              >
                {mission.status === 'OPEN'
                  ? 'Open'
                  : mission.status === 'COMPLETED'
                    ? 'Completed'
                    : mission.status.replace('_', ' ')}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Site:</span>
              <span className="ml-2 break-words font-medium">
                {mission.site_name}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2">
                {new Date(mission.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          <Tabs defaultValue="images" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
              <TabsTrigger
                value="images"
                className="flex items-center gap-2 whitespace-normal px-2 py-2 text-xs sm:text-sm"
              >
                <ImageIcon className="h-4 w-4" />
                Images ({images?.length || 0})
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="flex items-center gap-2 whitespace-normal px-2 py-2 text-xs sm:text-sm"
              >
                <ScanEye className="h-4 w-4" />
                AI Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="images" className="mt-4">
              {imagesLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : images && images.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {images.map((image) => (
                    <div key={image.id} className="relative">
                      <img
                        src={image.url}
                        alt="Inspection capture"
                        className="h-40 w-full cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                        onClick={() =>
                          window.open(image.url, '_blank', 'noopener,noreferrer')
                        }
                      />
                      {canDeleteImages && mission.status === 'OPEN' && (
                        <button
                          className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-xs text-destructive shadow-sm transition hover:opacity-90 disabled:opacity-60"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!confirm('Delete this image?')) return;
                            const deletingLastImage = (images?.length || 0) <= 1;
                            deleteMutation.mutate({
                              imageId: image.id,
                              missionId: mission.id,
                            }, {
                              onSuccess: () => {
                                if (deletingLastImage) {
                                  onOpenChange(false);
                                }
                              },
                            });
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No images uploaded yet
                </p>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="mt-4">
              <DefectAnalysis
                missionId={mission.id}
                imageCount={imagesLoading ? -1 : images?.length || 0}
                missionImages={images || []}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
