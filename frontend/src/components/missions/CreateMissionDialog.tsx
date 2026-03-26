import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateMission } from '@/hooks/useMissions';
import { usePanels } from '@/hooks/usePanels';
import { useSites } from '@/hooks/useSites';

const missionSchema = z.object({
  panelId: z.string().min(1, 'Please select a panel'),
  siteId: z.string().min(1, 'Please select a site'),
});

type MissionFormValues = z.infer<typeof missionSchema>;

interface CreateMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateMissionDialog({ open, onOpenChange }: CreateMissionDialogProps) {
  const createMutation = useCreateMission();
  const { data: sites = [], isLoading: sitesLoading } = useSites();
  const { data: panels = [], isLoading: panelsLoading } = usePanels();
  const [selectedSite, setSelectedSite] = useState<string>('');

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      panelId: '',
      siteId: '',
    },
  });

  const onSubmit = async (values: MissionFormValues) => {
    const panel = panels.find(p => p.id === values.panelId);
    const site = sites.find(s => s.id === values.siteId);

    if (!panel || !site) return;

    await createMutation.mutateAsync({
      panel_id: panel.id,
    });

    form.reset();
    setSelectedSite('');
    onOpenChange(false);
  };

  const handleClose = () => {
    form.reset();
    setSelectedSite('');
    onOpenChange(false);
  };

  // Filter panels by selected site
  const availablePanels = selectedSite
    ? panels.filter((panel) => panel.site_id === selectedSite)
    : [];

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
          <DialogTitle>New Inspection</DialogTitle>
          <DialogDescription>
            Create a new inspection. Select a site and panel, then upload images for analysis.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedSite(value);
                      // Reset panel selection when site changes
                      form.setValue('panelId', '');
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        <SelectValue placeholder={selectedSite ? "Select a panel" : "Select a site first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availablePanels.length > 0 ? (
                        availablePanels.map((panel) => (
                          <SelectItem key={panel.id} value={panel.id}>
                            {panel.label || 'Unknown'} ({panel.serial_number || 'N/A'})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No panels available for this site
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || sitesLoading || panelsLoading} className="w-full sm:w-auto">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  sitesLoading || panelsLoading ? 'Loading...' : 'Create Inspection'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
