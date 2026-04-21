import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Panel {
  id: string;
  site_id: string;
  label: string | null;
  serial_number: string | null;
  status: 'OK' | 'WARNING' | 'FAULT';
  deleted_at?: string | null;
  site_name?: string;
}

export interface PanelWithSite extends Panel {
  sites: { name: string } | null;
}

function usePanelsRealtimeInvalidation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = (supabase as any)
      .channel('realtime:panels:status-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'panels' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['panels'] });
          void queryClient.invalidateQueries({ queryKey: ['panel-stats'] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function usePanels() {
  usePanelsRealtimeInvalidation();

  return useQuery({
    queryKey: ['panels'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('panels')
        .select(`
          *,
          sites (name)
        `)
        .is('deleted_at', null)
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
        .select('status')
        .is('deleted_at', null);
      
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
