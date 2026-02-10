import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Panel {
  id: string;
  site_id: string;
  label: string | null;
  serial_number: string | null;
  status: 'OK' | 'WARNING' | 'FAULT';
  site_name?: string;
}

export interface PanelWithSite extends Panel {
  sites: { name: string } | null;
}

export function usePanels() {
  return useQuery({
    queryKey: ['panels'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('panels')
        .select(`
          *,
          sites (name)
        `)
        .order('label');
      
      if (error) throw error;
      
      // Transform to include site_name
      return (data as PanelWithSite[]).map(panel => ({
        ...panel,
        site_name: panel.sites?.name || 'Unknown Site',
      }));
    },
  });
}

export function usePanelStats() {
  return useQuery({
    queryKey: ['panel-stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('panels')
        .select('status');
      
      if (error) throw error;
      
      const panels = data as { status: string }[];
      const stats = {
        total: panels.length,
        ok: panels.filter(p => p.status === 'OK').length,
        warning: panels.filter(p => p.status === 'WARNING').length,
        fault: panels.filter(p => p.status === 'FAULT').length,
      };
      
      return stats;
    },
  });
}
