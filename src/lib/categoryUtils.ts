import { CalendarDays, Brain, CheckSquare, Bookmark, LucideIcon } from 'lucide-react';

export type BlockCategory = 'event' | 'thought' | 'task' | 'read_later';

export interface CategoryConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
  icon: LucideIcon;
}

export const CATEGORY_CONFIG: Record<BlockCategory, CategoryConfig> = {
  event: { 
    label: '出来事', 
    color: 'text-blue-600 dark:text-blue-400', 
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
    accentColor: 'bg-blue-500',
    icon: CalendarDays,
  },
  thought: { 
    label: '思ったこと', 
    color: 'text-purple-600 dark:text-purple-400', 
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    borderColor: 'border-purple-300 dark:border-purple-700',
    accentColor: 'bg-purple-500',
    icon: Brain,
  },
  task: { 
    label: 'タスク', 
    color: 'text-orange-600 dark:text-orange-400', 
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    borderColor: 'border-orange-300 dark:border-orange-700',
    accentColor: 'bg-orange-500',
    icon: CheckSquare,
  },
  read_later: { 
    label: 'あとで読む', 
    color: 'text-green-600 dark:text-green-400', 
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
    accentColor: 'bg-green-500',
    icon: Bookmark,
  },
};

export const CATEGORIES: BlockCategory[] = ['event', 'thought', 'task', 'read_later'];

const LAST_CATEGORY_KEY = 'flowlog_last_category';

export function getLastCategory(): BlockCategory {
  if (typeof window === 'undefined') return 'event'; // SSRガード
  const stored = localStorage.getItem(LAST_CATEGORY_KEY);
  if (stored && CATEGORIES.includes(stored as BlockCategory)) {
    return stored as BlockCategory;
  }
  return 'event';
}

export function setLastCategory(category: BlockCategory): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_CATEGORY_KEY, category);
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    event: '出来事',
    thought: '思ったこと',
    task: 'タスク',
    read_later: 'あとで読む',
  };
  return labels[category] || category;
}
