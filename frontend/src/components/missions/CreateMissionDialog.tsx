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
import { mockPanels, mockSites } from '@/data/mockData';

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
  const [selectedSite, setSelectedSite] = useState<string>('');

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      panelId: '',
      siteId: '',
    },
  });

  const onSubmit = async (values: MissionFormValues) => {
    const panel = mockPanels.find(p => p.id === values.panelId);
    const site = mockSites.find(s => s.id === values.siteId);

    if (!panel || !site) return;

    await createMutation.mutateAsync({
      panel_id: panel.id,
      panel_label: panel.label,
      site_name: site.name,
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
    ? mockPanels.filter(panel => panel.siteId === selectedSite)
    : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request New Mission</DialogTitle>
          <DialogDescription>
            Create a new drone inspection mission. It will be sent for approval by the drone team.
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
                      {mockSites.map((site) => (
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
                            {panel.label} ({panel.serialNumber})
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
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Mission'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
