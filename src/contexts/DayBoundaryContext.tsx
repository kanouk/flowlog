import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DayBoundaryContextValue {
  dayBoundaryHour: number;
  loading: boolean;
  setDayBoundaryHour: (hour: number) => void;
  saveDayBoundaryHour: (hour: number) => Promise<boolean>;
}

const DayBoundaryContext = createContext<DayBoundaryContextValue>({
  dayBoundaryHour: 0,
  loading: true,
  setDayBoundaryHour: () => {},
  saveDayBoundaryHour: async () => false,
});

export function DayBoundaryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dayBoundaryHour, setDayBoundaryHour] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDayBoundaryHour(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSetting() {
      try {
        const { data } = await supabase
          .from('user_ai_settings')
          .select('day_boundary_hour')
          .eq('user_id', user!.id)
          .maybeSingle();

        if (!cancelled) {
          setDayBoundaryHour((data as Record<string, unknown>)?.day_boundary_hour as number ?? 0);
        }
      } catch (error) {
        console.error('Error fetching day_boundary_hour:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSetting();
    return () => { cancelled = true; };
  }, [user]);

  const saveDayBoundaryHour = useCallback(async (hour: number): Promise<boolean> => {
    if (!user) return false;

    try {
      // Upsert: try update first, if no row exists insert
      const { data: existing } = await supabase
        .from('user_ai_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_ai_settings')
          .update({ day_boundary_hour: hour } as Record<string, unknown>)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_ai_settings')
          .insert({ user_id: user.id, day_boundary_hour: hour } as Record<string, unknown>);
        if (error) throw error;
      }

      setDayBoundaryHour(hour);
      return true;
    } catch (error) {
      console.error('Error saving day_boundary_hour:', error);
      return false;
    }
  }, [user]);

  return (
    <DayBoundaryContext.Provider value={{ dayBoundaryHour, loading, setDayBoundaryHour, saveDayBoundaryHour }}>
      {children}
    </DayBoundaryContext.Provider>
  );
}

export function useDayBoundary() {
  return useContext(DayBoundaryContext);
}
