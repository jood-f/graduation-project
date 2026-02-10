import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Fault {
  id: string;
  panel_id: string;
  fault_type: string;
  confidence: number;
  detected_at: string;
  panel_label?: string;
  site_name?: string;
}

export interface FaultWithPanel extends Fault {
  panels: { 
    label: string | null;
    sites: { name: string } | null;
  } | null;
}

export function useFaults() {
  return useQuery({
    queryKey: ['faults'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('faults')
        .select(`
          *,
          panels (
            label,
            sites (name)
          )
        `)
        .order('detected_at', { ascending: false });
      
      if (error) throw error;
      
      return (data as FaultWithPanel[]).map(fault => ({
        ...fault,
        panel_label: fault.panels?.label || 'Unknown',
        site_name: fault.panels?.sites?.name || 'Unknown Site',
      }));
    },
  });
}
