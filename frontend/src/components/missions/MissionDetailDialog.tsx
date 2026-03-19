import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMissionImages, useDeleteMissionImage, type Mission } from '@/hooks/useMissions';
import { DefectAnalysis } from '@/components/missions/DefectAnalysis';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, ScanEye } from 'lucide-react';

const statusStyles: Record<string, string> = {
  OPEN: 'bg-info/10 text-info border-info/20',
  COMPLETED: 'bg-success/10 text-success border-success/20',
};

interface MissionDetailDialogProps {
  mission: Mission | null;
  open: boolean;
  canDeleteImages: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionDetailDialog({ mission, open, canDeleteImages, onOpenChange }: MissionDetailDialogProps) {
  const { data: images, isLoading: imagesLoading } = useMissionImages(mission?.id ?? null);
  const deleteMut = useDeleteMissionImage();

  if (!mission) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inspection Details</DialogTitle>
          <DialogDescription>
            Inspection for panel {mission.panel_label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mission Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <Badge className={cn('ml-2', statusStyles[mission.status] || statusStyles.OPEN)}>
                {mission.status === 'OPEN' ? 'Open' : mission.status === 'COMPLETED' ? 'Completed' : mission.status.replace('_', ' ')}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Site:</span>
              <span className="ml-2 font-medium">{mission.site_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2">{new Date(mission.created_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Tabs for Images and AI Analysis */}
          <Tabs defaultValue="images" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="images" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Images ({images?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-2">
                <ScanEye className="h-4 w-4" />
                AI Analysis
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="images" className="mt-4">
              {imagesLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : images && images.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {images.map((img) => (
                    <div key={img.id} className="relative">
                      <img
                        src={img.url}
                        alt="Inspection capture"
                        className="rounded-lg object-cover h-40 w-full cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(img.url, '_blank')}
                      />
                      {canDeleteImages && mission.status === 'OPEN' && (
                        <button
                          className="absolute top-2 right-2 bg-white/80 rounded p-1 text-danger hover:opacity-90 disabled:opacity-60"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm('Delete this image?')) return;
                            deleteMut.mutate({ imageId: img.id, missionId: mission.id });
                          }}
                          disabled={deleteMut.isPending}
                        >
                          {deleteMut.isPending ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
