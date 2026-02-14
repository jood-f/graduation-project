import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInspectionResults, type InspectionResult } from '@/hooks/useAI';
import { AlertTriangle, CheckCircle, Flame, Snowflake, Droplet, Wrench, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DefectAnalysisProps {
  imageId: string;
}

const defectIcons = {
  HOTSPOT: Flame,
  CRACK: AlertTriangle,
  DUST: Droplet,
  SNOW: Snowflake,
  HARDWARE_DAMAGE: Wrench,
};

const defectColors = {
  HOTSPOT: 'text-red-500',
  CRACK: 'text-orange-500',
  DUST: 'text-yellow-500',
  SNOW: 'text-blue-500',
  HARDWARE_DAMAGE: 'text-purple-500',
};

const conditionStyles = {
  GOOD: 'bg-success/10 text-success border-success/20',
  FAIR: 'bg-info/10 text-info border-info/20',
  POOR: 'bg-warning/10 text-warning border-warning/20',
  CRITICAL: 'bg-destructive/10 text-destructive border-destructive/20',
};

  const { data: results, isLoading } = useInspectionResults(imageId);

  if (isLoading) {
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

  if (!results || results.length === 0) {
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
            <p className="text-xs text-muted-foreground mt-1">
              AI analysis found no issues with the inspected panels
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get overall condition from first result (all should have same condition per image)
  const overallCondition = results[0]?.overall_condition;
  const recommendedAction = results[0]?.recommended_action;

  // Group defects by type
  const defectsByType = results.reduce((acc, result) => {
    if (!acc[result.defect_type]) {
      acc[result.defect_type] = [];
    }
    acc[result.defect_type].push(result);
    return acc;
  }, {} as Record<string, InspectionResult[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Defect Analysis
          </CardTitle>
          {overallCondition && (
            <Badge className={cn(conditionStyles[overallCondition])}>
              {overallCondition}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Defect Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(defectsByType).map(([type, defects]) => {
            const Icon = defectIcons[type as keyof typeof defectIcons];
            const avgConfidence = defects.reduce((sum, d) => sum + d.confidence, 0) / defects.length;
            
            return (
              <div key={type} className="flex flex-col items-center p-3 rounded-lg border bg-muted/50">
                <Icon className={cn('h-6 w-6 mb-2', defectColors[type as keyof typeof defectColors])} />
                <span className="text-2xl font-bold">{defects.length}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {type.toLowerCase().replace('_', ' ')}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {(avgConfidence * 100).toFixed(0)}% conf.
                </span>
              </div>
            );
          })}
        </div>

        {/* Detailed Defects List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Detected Defects</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((result) => {
              const Icon = defectIcons[result.defect_type];
              return (
                <div
                  key={result.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm"
                >
                  <Icon className={cn('h-5 w-5 mt-0.5', defectColors[result.defect_type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">
                        {result.defect_type.toLowerCase().replace('_', ' ')}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {(result.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    </div>
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Location: [{result.bbox_x.toFixed(3)}, {result.bbox_y.toFixed(3)}] 
                      Size: {result.bbox_width.toFixed(3)} × {result.bbox_height.toFixed(3)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommended Action */}
        {recommendedAction && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm font-medium text-primary mb-1">
              Recommended Action
            </p>
            <p className="text-sm text-muted-foreground">
              {recommendedAction}
            </p>
          </div>
        )}

        {/* AI Model Info */}
        <p className="text-xs text-center text-muted-foreground">
          Analyzed by YOLOv8 • Solar Panel Defect Detection Model
        </p>
      </CardContent>
    </Card>
  );
}
