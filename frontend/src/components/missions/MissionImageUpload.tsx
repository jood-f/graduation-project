import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { useUploadMissionImage } from '@/hooks/useMissions';
import { toast } from 'sonner';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const getFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

interface MissionImageUploadProps {
  missionId: string;
  missionLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionImageUpload({ missionId, missionLabel, open, onOpenChange }: MissionImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const uploadMutation = useUploadMissionImage();

  const handleIncomingFiles = (incoming: File[]) => {
    const valid: File[] = [];
    const rejected: string[] = [];
    const seen = new Set<string>();

    incoming.forEach((file) => {
      const dedupeKey = getFileKey(file);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      if (!ACCEPTED_TYPES.has(file.type)) {
        rejected.push(`${file.name} (unsupported type)`);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(`${file.name} (>10MB)`);
        return;
      }

      valid.push(file);
    });

    setSelectedFiles((currentFiles) => {
      const existingKeys = new Set(currentFiles.map(getFileKey));
      const filesToAdd = valid.filter((file) => !existingKeys.has(getFileKey(file)));
      return [...currentFiles, ...filesToAdd];
    });
    if (rejected.length > 0) {
      toast.error(`Skipped ${rejected.length} invalid file(s). Use JPG, PNG, WEBP up to 10MB.`);
    }
  };

  const handleRemoveSelectedFile = (fileToRemove: File) => {
    const removeKey = getFileKey(fileToRemove);
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((file) => getFileKey(file) !== removeKey)
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleIncomingFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (event.dataTransfer.files?.length) {
      handleIncomingFiles(Array.from(event.dataTransfer.files));
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsAnalyzing(true);
    const failedFiles: File[] = [];
    try {
      for (const file of selectedFiles) {
        try {
          await uploadMutation.mutateAsync({ 
            missionId, 
            file,
            enableAI: true,
          });
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          failedFiles.push(file);
        }
      }

      if (failedFiles.length === 0) {
        setSelectedFiles([]);
        onOpenChange(false);
      } else {
        setSelectedFiles(failedFiles);
        toast.error(`${failedFiles.length} file(s) failed to upload. Fix and retry.`);
      }
    } catch (error) {
      console.error('Upload batch error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setIsDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Images for Analysis</DialogTitle>
          <DialogDescription>
            Upload panel images for inspection: <span className="break-words">{missionLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Select inspection images"
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8 ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleZoneKeyDown}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click to select images or drag and drop
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WEBP up to 10MB each
            </p>
          </div>

          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Selected files:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedFiles.map((file) => (
                  <div key={getFileKey(file)} className="flex min-w-0 items-center gap-2 rounded-lg bg-muted p-2 text-sm">
                    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => handleRemoveSelectedFile(file)}
                      disabled={uploadMutation.isPending || isAnalyzing}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || uploadMutation.isPending || isAnalyzing}
            className="w-full sm:w-auto"
          >
            {uploadMutation.isPending || isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isAnalyzing ? 'Analyzing with AI...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
