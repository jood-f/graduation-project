import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Switch } from '@/components/ui/switch';
import { Loader2, Upload } from 'lucide-react';

import { useCreateMission } from '@/hooks/useMissions';
import { usePanels } from '@/hooks/usePanels';
import { useSites } from '@/hooks/useSites';

import { useQueryClient } from '@tanstack/react-query';
import { MissionImageUpload } from '@/components/missions/MissionImageUpload';

const missionSchema = z.object({
  panelId: z.string().min(1),
  siteId: z.string().min(1),
  aiDetection: z.boolean().default(true),
});

type MissionFormValues = z.infer<typeof missionSchema>;

export function CreateMissionDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();

  const createMutation = useCreateMission();
  const { data: sites = [] } = useSites();
  const { data: panels = [] } = usePanels();

  const [selectedSite, setSelectedSite] = useState('');
  const [missionId, setMissionId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      panelId: '',
      siteId: '',
      aiDetection: true,
    },
  });

  const availablePanels = selectedSite
    ? panels.filter(p => p.site_id === selectedSite)
    : [];

  const handleClose = () => {
    form.reset();
    setSelectedSite('');
    setMissionId(null);
    setUploading(false);
    onOpenChange(false);
  };

  // STEP 1: create mission
  const onSubmit = async (values: MissionFormValues) => {
    const panel = panels.find(p => p.id === values.panelId);
    if (!panel) return;

    const res = await createMutation.mutateAsync({
      panel_id: panel.id,
      ai_detection: values.aiDetection,
    });

    if (!res?.id) return;

    setMissionId(res.id);

    // IMPORTANT: stay inside same popup, now show upload section
    setUploading(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-[#060b09] text-white border-white/10 sm:max-w-lg">

        <DialogHeader>
          <DialogTitle>New Inspection</DialogTitle>
          <DialogDescription className="text-gray-400">
            Create inspection and upload images for AI analysis
          </DialogDescription>
        </DialogHeader>

        {/* ================= STEP 1: FORM ================= */}
        {!uploading && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* SITE */}
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setSelectedSite(v);
                        form.setValue('panelId', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* PANEL */}
              <FormField
                control={form.control}
                name="panelId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Panel</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!selectedSite}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availablePanels.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* AI */}
              <FormField
                control={form.control}
                name="aiDetection"
                render={({ field }) => (
                  <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <p className="text-sm">AI Detection</p>
                      <p className="text-xs text-gray-400">
                        YOLOv8 analysis enabled
                      </p>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="gap-2 bg-[#4b8a6e]"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Create
                </Button>
              </DialogFooter>

            </form>
          </Form>
        )}

        {/* ================= STEP 2: UPLOAD INSIDE SAME POPUP ================= */}
        {uploading && missionId && (
          <div className="space-y-4">
            <div className="text-sm text-gray-400">
              Upload images for AI analysis
            </div>

            <MissionImageUpload
              missionId={missionId}
              missionLabel="New Inspection"
              open={true}
              onOpenChange={async (open) => {
                if (!open) {
                  handleClose();

                  // 🔥 SAME AS TABLE BEHAVIOR
                  await queryClient.invalidateQueries({ queryKey: ['missions'] });
                  await queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
                }
              }}
            />
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}