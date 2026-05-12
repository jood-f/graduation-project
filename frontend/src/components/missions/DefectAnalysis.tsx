import { FC } from 'react';
import { AlertTriangle, CheckCircle, Droplet, Flame, Snowflake, Sparkles, Wrench, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMissionFaults } from '@/hooks/useFaults';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface DefectAnalysisProps {
  missionId: string;
  imageCount: number;
  missionImages: { id: string; storage_path: string; url?: string }[];
}

const defectIcons = {
  HOTSPOT: Flame,
  CRACK: AlertTriangle,
  DUST: Droplet,
  SNOW: Snowflake,
  HARDWARE_DAMAGE: Wrench,
} as const;

const defectColors = {
  HOTSPOT: 'text-red-500',
  CRACK: 'text-orange-500',
  DUST: 'text-yellow-500',
  SNOW: 'text-blue-500',
  HARDWARE_DAMAGE: 'text-purple-500',
} as const;

const conditionStyles = {
  GOOD: 'bg-success/10 text-success border-success/20',
  FAIR: 'bg-info/10 text-info border-info/20',
  POOR: 'bg-warning/10 text-warning border-warning/20',
  CRITICAL: 'bg-destructive/10 text-destructive border-destructive/20',
} as const;

const DefectAnalysis: FC<DefectAnalysisProps> = ({ missionId, imageCount, missionImages }) => {
  const queryClient = useQueryClient();
  const {
    data: summaryResults,
    isLoading,
    error,
    refetch: refetchSummaryResults,
  } = useMissionFaults(missionId);

  const reanalyzeMutation = useMutation({
    mutationFn: async ({ imageId, threshold = 0.5 }: { imageId: string; threshold?: number }) => {
      const response = await apiFetch(
        `/mission-images/${imageId}/re-analyze?confidence_threshold=${threshold}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.ok) throw new Error('Failed to re-analyze image');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-cv-faults', missionId] });
      toast.success(`Re-analysis triggered successfully.`);
    },
    onError: (err) => {
      toast.error(`Re-analysis failed: ${(err as Error).message}`);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ inspectionId }: { inspectionId: string }) => {
      const response = await apiFetch(`/inspection-results/${inspectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'PASS', 
          notes: 'Manually dismissed by user' 
        }),
      });
      if (!response.ok) throw new Error('Failed to dismiss detection');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-cv-faults', missionId] });
      toast.success('Detection dismissed');
    },
    onError: (err) => {
      toast.error(`Dismiss failed: ${(err as Error).message}`);
    },
  });

  const results = summaryResults || [];
  const summaryErrorMessage = error instanceof Error ? error.message : 'Failed to load defect analysis.';

  if (isLoading || imageCount < 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Defect Analysis</CardTitle></CardHeader>
        <CardContent className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  if (imageCount === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Defect Analysis</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p className="text-sm font-medium">No Images Available</p>
            <p className="text-xs mt-1">Upload mission images to run CV analysis.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0 && !error) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Defect Analysis</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-12 w-12 text-success mb-3" />
            <p className="text-sm font-medium">No Defects Detected</p>
            <p className="text-xs text-muted-foreground mt-1">CV analysis found no issues in mission images.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const defectsByType = results.reduce((acc, result) => {
    if (!acc[result.fault_type]) acc[result.fault_type] = [];
    acc[result.fault_type].push(result);
    return acc;
  }, {} as Record<string, typeof results>);

  const maxConfidence = results.length > 0 ? Math.max(...results.map((r) => r.confidence)) : 0;
  const overallCondition = maxConfidence >= 0.9 ? 'CRITICAL' : maxConfidence >= 0.8 ? 'POOR' : maxConfidence >= 0.7 ? 'FAIR' : 'GOOD';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
          <Badge className={cn('w-fit', conditionStyles[overallCondition])}>{overallCondition}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive text-center">
            {summaryErrorMessage}
            <Button variant="link" size="sm" onClick={() => refetchSummaryResults()} className="h-auto p-0 ml-2 text-destructive underline">Try Again</Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(defectsByType).map(([type, defects]) => {
            const Icon = defectIcons[type as keyof typeof defectIcons] || AlertTriangle;
            const avgConfidence = defects.reduce((s, d) => s + d.confidence, 0) / defects.length;
            return (
              <div key={type} className="flex flex-col items-center p-3 rounded-lg border bg-muted/50">
                <Icon className={cn('h-6 w-6 mb-2', defectColors[type as keyof typeof defectColors])} />
                <span className="text-2xl font-bold">{defects.length}</span>
                <span className="text-xs text-muted-foreground capitalize">{type.toLowerCase().replace('_', ' ')}</span>
                <span className="text-[10px] text-muted-foreground mt-1">{(avgConfidence * 100).toFixed(0)}% conf.</span>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Detected Defects</h4>
          <div className="touch-scroll max-h-[500px] space-y-3 overflow-y-auto pr-2">
            {results.map((result) => {
              const Icon = defectIcons[result.fault_type as keyof typeof defectIcons] || AlertTriangle;
              const imageUrl = missionImages.find(img => img.id === result.mission_image_id)?.url;

              return (
                <div key={result.id} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row">
                  <div className="relative h-28 w-full sm:w-40 flex-shrink-0 bg-muted rounded-md overflow-hidden border">
                    {imageUrl ? (
                      <img src={imageUrl} alt="Fault Detection" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No Preview</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-5 w-5", defectColors[result.fault_type as keyof typeof defectColors])} />
                        <span className="font-bold capitalize text-base">{result.fault_type.toLowerCase().replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <p><span className="font-medium text-foreground">Confidence:</span> {(result.confidence * 100).toFixed(2)}%</p>
                      <p><span className="font-medium text-foreground">Model:</span> {result.model_version || 'yolov8-solar-cls-v1'}</p>
                      <p><span className="font-medium text-foreground">Time:</span> {new Date(result.detected_at).toLocaleString()}</p>
                      <p className="truncate"><span className="font-medium text-foreground">Image:</span> {result.storage_path?.split('/').pop() || 'Unknown'}</p>
                    </div>

                    <div className="mt-4 flex justify-end items-center gap-2 border-t pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={reanalyzeMutation.isPending}
                        onClick={() => {
                          if (result.mission_image_id) {
                            reanalyzeMutation.mutate({ imageId: result.mission_image_id, threshold: 0.5 });
                          }
                        }}
                      >
                        {reanalyzeMutation.isPending ? 'Analyzing...' : 'Re-analyze'}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        disabled={dismissMutation.isPending}
                        onClick={() => dismissMutation.mutate({ inspectionId: result.id })}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-center text-muted-foreground pt-2 border-t">
          Analyzed by YOLOv8 - Solar Panel Classification Model
        </p>
      </CardContent>
    </Card>
  );
};

export { DefectAnalysis };