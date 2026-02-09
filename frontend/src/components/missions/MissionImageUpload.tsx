import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Loader2, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useUploadMissionImage } from '@/hooks/useMissions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface MissionImageUploadProps {
  missionId: string;
  missionLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionImageUpload({ missionId, missionLabel, open, onOpenChange }: MissionImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const isGeminiConfigured = Boolean(import.meta.env.VITE_GEMINI_API_KEY);
  const [enableAI, setEnableAI] = useState(isGeminiConfigured);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const uploadMutation = useUploadMissionImage();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    setIsAnalyzing(enableAI);
    try {
      for (const file of selectedFiles) {
        try {
          await uploadMutation.mutateAsync({ 
            missionId, 
            file,
            enableAI 
          });
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          // Continue with next file instead of stopping
        }
      }
      setSelectedFiles([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Upload batch error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Mission Images</DialogTitle>
          <DialogDescription>
            Upload drone inspection images for mission: {missionLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground text-center">
              Click to select images or drag and drop
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, WEBP up to 10MB each
            </p>
          </div>

          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Selected files:</p>
              <div className="grid grid-cols-2 gap-2">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2 p-3 rounded-lg border bg-muted/50">
            <Switch
              id="ai-analysis"
              checked={enableAI}
              onCheckedChange={setEnableAI}
              disabled={!isGeminiConfigured}
            />
            <div className="flex-1">
              <Label htmlFor="ai-analysis" className="flex items-center gap-2 cursor-pointer">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">AI Defect Detection</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically detect cracks, hotspots, dust, and other defects using Gemini 1.5 Pro
              </p>
              {!isGeminiConfigured && (
                <p className="text-xs text-amber-600 mt-1">
                  AI disabled: set VITE_GEMINI_API_KEY to enable analysis
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || uploadMutation.isPending || isAnalyzing}
          >
            {uploadMutation.isPending || isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isAnalyzing ? 'Analyzing with AI...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
