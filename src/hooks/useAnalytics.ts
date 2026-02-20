import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { subDays, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '@/lib/dateUtils';

export type PeriodDays = 7 | 30 | 90;

interface ScoreDataPoint {
  date: string;
  score: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

interface DailyActivity {
  date: string;
  event: number;
  task: number;
  schedule: number;
  thought: number;
  read_later: number;
}

export function useAnalytics(days: PeriodDays) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const scoreQuery = useQuery({
    queryKey: ['analytics-scores', userId, days],
    queryFn: async (): Promise<ScoreDataPoint[]> => {
      const { data, error } = await supabase
        .from('entries')
        .select('date, score')
        .not('score', 'is', null)
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(e => ({ date: e.date, score: e.score! }));
    },
    enabled: !!userId,
  });

  const blocksQuery = useQuery({
    queryKey: ['analytics-blocks', userId, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('category, occurred_at')
        .gte('occurred_at', new Date(startDate + 'T00:00:00').toISOString());

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

  const categoryData: CategoryCount[] = (() => {
    if (!blocksQuery.data) return [];
    const counts: Record<string, number> = {};
    for (const b of blocksQuery.data) {
      counts[b.category] = (counts[b.category] || 0) + 1;
    }
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  })();

  const dailyActivity: DailyActivity[] = (() => {
    if (!blocksQuery.data) return [];
    const map: Record<string, DailyActivity> = {};
    for (const b of blocksQuery.data) {
      const dayKey = formatInTimeZone(new Date(b.occurred_at), TIMEZONE, 'yyyy-MM-dd');
      if (!map[dayKey]) {
        map[dayKey] = { date: dayKey, event: 0, task: 0, schedule: 0, thought: 0, read_later: 0 };
      }
      const cat = b.category as keyof Omit<DailyActivity, 'date'>;
      if (cat in map[dayKey]) {
        map[dayKey][cat]++;
      }
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  })();

  return {
    scoreData: scoreQuery.data ?? [],
    categoryData,
    dailyActivity,
    isLoading: scoreQuery.isLoading || blocksQuery.isLoading,
  };
}
