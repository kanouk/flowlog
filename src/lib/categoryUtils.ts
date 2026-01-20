import { CalendarDays, Brain, CheckSquare, Bookmark, Briefcase, Users, User, LucideIcon } from 'lucide-react';

export type BlockCategory = 'event' | 'thought' | 'task' | 'read_later';
export type BlockTag = 'work' | 'family' | 'private';

export interface CategoryConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
  buttonColor: string;
  icon: LucideIcon;
}

export interface TagConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
}

export const CATEGORY_CONFIG: Record<BlockCategory, CategoryConfig> = {
  event: { 
    label: '出来事', 
    color: 'text-blue-600 dark:text-blue-400', 
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
    accentColor: 'bg-blue-500',
    buttonColor: 'bg-blue-500 hover:bg-blue-600 text-white',
    icon: CalendarDays,
  },
  thought: { 
    label: 'メモ', 
    color: 'text-purple-600 dark:text-purple-400', 
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    borderColor: 'border-purple-300 dark:border-purple-700',
    accentColor: 'bg-purple-500',
    buttonColor: 'bg-purple-500 hover:bg-purple-600 text-white',
    icon: Brain,
  },
  task: { 
    label: 'タスク', 
    color: 'text-orange-600 dark:text-orange-400', 
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    borderColor: 'border-orange-300 dark:border-orange-700',
    accentColor: 'bg-orange-500',
    buttonColor: 'bg-orange-500 hover:bg-orange-600 text-white',
    icon: CheckSquare,
  },
  read_later: { 
    label: 'あとで読む', 
    color: 'text-green-600 dark:text-green-400', 
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
    accentColor: 'bg-green-500',
    buttonColor: 'bg-green-500 hover:bg-green-600 text-white',
    icon: Bookmark,
  },
};

export const TAG_CONFIG: Record<BlockTag, TagConfig> = {
  work: {
    label: '仕事',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: Briefcase,
  },
  family: {
    label: '家族',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    icon: Users,
  },
  private: {
    label: 'プライベート',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    icon: User,
  },
};

export const CATEGORIES: BlockCategory[] = ['event', 'task', 'thought', 'read_later'];
export const TAGS: BlockTag[] = ['work', 'family', 'private'];

const LAST_CATEGORY_KEY = 'flowlog_last_category';
const LAST_TAG_KEY = 'flowlog_last_tag';

export function getLastCategory(): BlockCategory {
  if (typeof window === 'undefined') return 'event';
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

export function getLastTag(): BlockTag | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LAST_TAG_KEY);
  if (stored && TAGS.includes(stored as BlockTag)) {
    return stored as BlockTag;
  }
  return null;
}

export function setLastTag(tag: BlockTag | null): void {
  if (typeof window === 'undefined') return;
  if (tag) {
    localStorage.setItem(LAST_TAG_KEY, tag);
  } else {
    localStorage.removeItem(LAST_TAG_KEY);
  }
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    event: '出来事',
    thought: 'メモ',
    task: 'タスク',
    read_later: 'あとで読む',
  };
  return labels[category] || category;
}
