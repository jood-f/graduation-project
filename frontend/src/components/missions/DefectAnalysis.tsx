import { FC } from 'react';
import { AlertTriangle, CheckCircle, Droplet, Flame, Snowflake, Sparkles, Wrench, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMissionFaults, type MissionFault } from '@/hooks/useFaults';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useInspectionStore } from '@/stores/inspectionStore';

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

type RawDetection = {
  inspection_id: string;
  class_name: string;
  confidence: number;
  bbox: { x?: number; y?: number; width?: number; height?: number } | null;
  status: 'PASS' | 'FAIL' | 'REVIEW';
  model_version?: string | null;
  notes?: string | null;
};

type ImageDebugResult = {
  imageId: string;
  storagePath: string;
  imageUrl?: string;
  detections: RawDetection[];
  error?: string;
};

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

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to re-analyze image');
      }

      return await response.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['mission-cv-raw-by-image', missionId] });
      queryClient.invalidateQueries({ queryKey: ['mission-cv-faults', missionId] });
      toast.success(`Re-analysis completed for image ${vars.imageId.slice(0, 8)}...`);
    },
    onError: (err) => {
      toast.error(`Re-analysis failed: ${(err as Error).message}`);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ inspectionId }: { inspectionId: string }) => {
      const response = await apiFetch(
        `/inspection-results/${inspectionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PASS', notes: 'Manually dismissed by user (incorrect classification)' }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to dismiss detection');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-cv-raw-by-image', missionId] });
      queryClient.invalidateQueries({ queryKey: ['mission-cv-faults', missionId] });
      toast.success('Detection dismissed as incorrect classification');
    },
    onError: (err) => {
      toast.error(`Dismiss failed: ${(err as Error).message}`);
    },
  });

  const {
    data: rawByImage,
    isLoading: rawLoading,
    refetch: refetchRawByImage,
  } = useQuery({
    queryKey: ['mission-cv-raw-by-image', missionId, missionImages.map((img) => img.id).join(',')],
    queryFn: async (): Promise<ImageDebugResult[]> => {
      const rows = await Promise.all(
        missionImages.map(async (img) => {
          try {
            const res = await apiFetch(`/mission-images/${img.id}/results`);
            if (!res.ok) {
              return {
                imageId: img.id,
                storagePath: img.storage_path,
                imageUrl: img.url,
                detections: [],
                error: `HTTP ${res.status}`,
              } as ImageDebugResult;
            }

            const detections = (await res.json()) as RawDetection[];
            return {
              imageId: img.id,
              storagePath: img.storage_path,
              imageUrl: img.url,
              detections,
            } as ImageDebugResult;
          } catch (e) {
            return {
              imageId: img.id,
              storagePath: img.storage_path,
              imageUrl: img.url,
              detections: [],
              error: e instanceof Error ? e.message : 'Request failed',
            } as ImageDebugResult;
          }
        })
      );
      return rows;
    },
    enabled: imageCount > 0 && missionImages.length > 0,
  });

  const imagePathById = new Map(missionImages.map((image) => [image.id, image.storage_path]));
  const summaryErrorMessage = error instanceof Error ? error.message : 'Failed to load defect analysis.';

  const rawFallbackResults: MissionFault[] = (rawByImage || []).flatMap((item) =>
    item.detections
      .filter((detection) => detection.status === 'FAIL')
      .map((detection) => ({
        id: detection.inspection_id,
        panel_id: '',
        fault_type: detection.class_name || 'Unknown Defect',
        confidence: detection.confidence ?? 0,
        detected_at: new Date().toISOString(),
        mission_id: missionId,
        mission_image_id: item.imageId,
        bbox: detection.bbox,
        status: detection.status,
        storage_path: item.storagePath,
        model_version: detection.model_version ?? null,
        panel_label: 'Unknown',
        site_name: 'Unknown Site',
      }))
  );

  const localFallbackResults: MissionFault[] = useInspectionStore.getResultsByMission(missionId).map((result) => ({
    id: result.id,
    panel_id: '',
    fault_type: result.defect_type,
    confidence: result.confidence,
    detected_at: result.created_at,
    mission_id: missionId,
    mission_image_id: result.mission_image_id ?? null,
    bbox:
      result.bbox_width != null && result.bbox_height != null
        ? {
            x: result.bbox_x ?? 0,
            y: result.bbox_y ?? 0,
            width: result.bbox_width,
            height: result.bbox_height,
          }
        : null,
    status: 'FAIL',
    storage_path: result.mission_image_id ? imagePathById.get(result.mission_image_id) || null : null,
    model_version: 'client-heuristic-v1',
    panel_label: 'Unknown',
    site_name: 'Unknown Site',
  }));

  const fallbackResults = rawFallbackResults.length > 0 ? rawFallbackResults : localFallbackResults;
  const usingRawFallback = (!summaryResults || summaryResults.length === 0) && rawFallbackResults.length > 0;
  const usingLocalFallback =
    (!summaryResults || summaryResults.length === 0) &&
    rawFallbackResults.length === 0 &&
    localFallbackResults.length > 0;
  const results = summaryResults && summaryResults.length > 0 ? summaryResults : fallbackResults;
  const waitingForFallbackResults = !!error && rawLoading && results.length === 0;

  const renderRawDebugSection = () => (
    <div className="space-y-3 border-t pt-4">
      <h4 className="text-sm font-medium">Raw CV Results (Debug)</h4>
      {rawLoading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
      {!rawLoading && (!rawByImage || rawByImage.length === 0) && (
        <p className="text-xs text-muted-foreground">No image-level CV results were returned.</p>
      )}
      {!rawLoading && rawByImage?.map((item) => (
        <div key={item.imageId} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">Image: {item.storagePath}</p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">{item.imageId}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {item.detections.length} detection(s)
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={reanalyzeMutation.isPending}
                onClick={() => reanalyzeMutation.mutate({ imageId: item.imageId, threshold: 0.5 })}
              >
                {reanalyzeMutation.isPending ? 'Re-analyzing...' : 'Re-analyze'}
              </Button>
            </div>
          </div>

          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.storagePath} className="h-24 w-full max-w-40 rounded border object-cover" />
          )}

          {item.error && (
            <p className="text-xs text-destructive">Failed to fetch detections: {item.error}</p>
          )}

          {!item.error && item.detections.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No detections returned for this image (model may classify it as clean or miss defects).
            </p>
          )}

          {!item.error && item.detections.length > 0 && (
            <div className="space-y-1">
              {item.detections.map((d) => (
                <div key={d.inspection_id} className="text-xs rounded border bg-muted/40 p-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">
                      class: {d.class_name}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {d.status === 'FAIL' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-destructive hover:text-destructive"
                          disabled={dismissMutation.isPending}
                          onClick={() => dismissMutation.mutate({ inspectionId: d.inspection_id })}
                          title="Dismiss this detection as incorrect"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Dismiss
                        </Button>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          d.status === 'FAIL'
                            ? 'border-destructive/30 text-destructive'
                            : d.status === 'PASS'
                            ? 'border-success/30 text-success'
                            : ''
                        )}
                      >
                        {d.status}
                      </Badge>
                    </div>
                  </div>
                  {d.model_version && (
                    <p>model: {d.model_version}</p>
                  )}
                  <p>confidence: {(d.confidence * 100).toFixed(2)}%</p>
                  {d.notes && <p>notes: {d.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (isLoading || waitingForFallbackResults || imageCount < 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (imageCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium">No Images Available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload mission images to run CV analysis and see defects.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load defect analysis.</p>
            <p className="mt-2 max-w-xl text-xs text-muted-foreground">{summaryErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                void refetchSummaryResults();
                void refetchRawByImage();
              }}
            >
              Try Again
            </Button>
          </div>
          {renderRawDebugSection()}
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-12 w-12 text-success mb-3" />
            <p className="text-sm font-medium">No Defects Detected</p>
            <p className="text-xs text-muted-foreground mt-1">CV analysis found no issues in mission images.</p>
          </div>
          {renderRawDebugSection()}
        </CardContent>
      </Card>
    );
  }

  const defectsByType = results.reduce((acc, result) => {
    if (!acc[result.fault_type]) acc[result.fault_type] = [] as typeof results;
    acc[result.fault_type].push(result);
    return acc;
  }, {} as Record<string, typeof results>);

  const maxConfidence = Math.max(...results.map((r) => r.confidence));
  const overallCondition =
    maxConfidence >= 0.9 ? 'CRITICAL' : maxConfidence >= 0.8 ? 'POOR' : maxConfidence >= 0.7 ? 'FAIR' : 'GOOD';

  const recommendedAction =
    maxConfidence >= 0.85
      ? 'High priority: review detected defects and schedule maintenance.'
      : 'Review detected defects and continue monitoring.';

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

      <CardContent className="space-y-4">
        {(usingRawFallback || usingLocalFallback || error) && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              error ? 'border-warning/30 bg-warning/10 text-warning' : 'border-primary/20 bg-primary/5 text-primary'
            )}
          >
            {usingRawFallback
              ? error
                ? `Mission summary request failed, so this view is using image-level detections instead. ${summaryErrorMessage}`
                : 'This view is using image-level detections because no summarized defects were returned.'
              : usingLocalFallback
              ? error
                ? `Mission summary request failed, so this view is using locally cached detections instead. ${summaryErrorMessage}`
                : 'This view is using locally cached detections from the current session.'
              : summaryErrorMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(defectsByType).map(([type, defects]) => {
            const Icon = defectIcons[type as keyof typeof defectIcons] || AlertTriangle;
            const avgConfidence = defects.reduce((s, d) => s + d.confidence, 0) / defects.length;
            return (
              <div key={type} className="flex flex-col items-center p-3 rounded-lg border bg-muted/50">
                <Icon
                  className={cn('h-6 w-6 mb-2', defectColors[type as keyof typeof defectColors] || 'text-muted-foreground')}
                  aria-label={type}
                />
                <span className="text-2xl font-bold">{defects.length}</span>
                <span className="text-xs text-muted-foreground capitalize">{type.toLowerCase().replace('_', ' ')}</span>
                <span className="text-xs text-muted-foreground mt-1">{(avgConfidence * 100).toFixed(0)}% conf.</span>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Detected Defects</h4>
          <div className="touch-scroll max-h-64 space-y-2 overflow-y-auto">
            {results.map((result) => {
              const Icon = defectIcons[result.fault_type as keyof typeof defectIcons] || AlertTriangle;

              return (
                <div key={result.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm sm:flex-row sm:items-start">
                  <Icon
                    className={cn(
                      'h-5 w-5 mt-0.5',
                      defectColors[result.fault_type as keyof typeof defectColors] || 'text-muted-foreground'
                    )}
                    aria-label={result.fault_type}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium capitalize">{result.fault_type.toLowerCase().replace('_', ' ')}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-destructive hover:text-destructive"
                          disabled={dismissMutation.isPending}
                          onClick={() => dismissMutation.mutate({ inspectionId: result.id })}
                          title="Dismiss this detection as incorrect classification"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Dismiss
                        </Button>
                        <Badge variant="outline" className="text-xs">
                          {(result.confidence * 100).toFixed(0)}% confidence
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Image: {result.storage_path || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Detected at: {new Date(result.detected_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-primary mb-1">Recommended Action</p>
          <p className="text-sm text-muted-foreground">{recommendedAction}</p>
        </div>

        {renderRawDebugSection()}

        <p className="text-xs text-center text-muted-foreground">Analyzed by YOLOv8 - Solar Panel Defect Detection Model</p>
      </CardContent>
    </Card>
  );
};

export { DefectAnalysis };
