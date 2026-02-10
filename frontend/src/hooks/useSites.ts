import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Site {
  id: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity_mw: number | null;
  created_at: string;
}

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sites')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Site[];
    },
  });
}
