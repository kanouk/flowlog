import { CalendarDays, FileText, CheckSquare, Bookmark, Briefcase, Users, User, CalendarClock, LucideIcon } from 'lucide-react';

export type BlockCategory = 'event' | 'thought' | 'task' | 'read_later' | 'schedule';
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
    icon: FileText,
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
  schedule: { 
    label: '予定', 
    color: 'text-cyan-600 dark:text-cyan-400', 
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    borderColor: 'border-cyan-300 dark:border-cyan-700',
    accentColor: 'bg-cyan-500',
    buttonColor: 'bg-cyan-500 hover:bg-cyan-600 text-white',
    icon: CalendarClock,
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

export const CATEGORIES: BlockCategory[] = ['event', 'task', 'schedule', 'thought', 'read_later'];
export const TAGS: BlockTag[] = ['work', 'family', 'private'];

const LAST_CATEGORY_KEY = 'flowlog_last_category';
const LAST_TAG_KEY = 'flowlog_last_tag';

export function getLastCategory(): BlockCategory {
  if (typeof window === 'undefined') return 'event';
  const stored = sessionStorage.getItem(LAST_CATEGORY_KEY);
  if (stored && CATEGORIES.includes(stored as BlockCategory)) {
    return stored as BlockCategory;
  }
  return 'event';
}

export function setLastCategory(category: BlockCategory): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LAST_CATEGORY_KEY, category);
}

export function getLastTag(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(LAST_TAG_KEY);
}

export function setLastTag(tag: string | null): void {
  if (typeof window === 'undefined') return;
  if (tag) {
    sessionStorage.setItem(LAST_TAG_KEY, tag);
  } else {
    sessionStorage.removeItem(LAST_TAG_KEY);
  }
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    event: '出来事',
    thought: 'メモ',
    task: 'タスク',
    read_later: 'あとで読む',
    schedule: '予定',
  };
  return labels[category] || category;
}

// スケジュール表示用フォーマット関数
export function formatScheduleRange(
  startsAt: string | null, 
  endsAt: string | null, 
  isAllDay: boolean
): string {
  if (!startsAt) return '';
  
  const startDate = new Date(startsAt);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const startHours = String(startDate.getHours()).padStart(2, '0');
  const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
  
  if (isAllDay) {
    if (!endsAt) {
      return `${startMonth}月${startDay}日（終日）`;
    }
    const endDate = new Date(endsAt);
    const endMonth = endDate.getMonth() + 1;
    const endDay = endDate.getDate();
    if (startMonth === endMonth && startDay === endDay) {
      return `${startMonth}月${startDay}日（終日）`;
    }
    return `${startMonth}月${startDay}日 〜 ${endMonth}月${endDay}日`;
  }
  
  if (!endsAt) {
    return `${startMonth}月${startDay}日 ${startHours}:${startMinutes}〜`;
  }
  
  const endDate = new Date(endsAt);
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();
  const endHours = String(endDate.getHours()).padStart(2, '0');
  const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
  
  // 同日の場合
  if (startMonth === endMonth && startDay === endDay) {
    return `${startMonth}月${startDay}日 ${startHours}:${startMinutes}〜${endHours}:${endMinutes}`;
  }
  
  // 日跨ぎの場合
  return `${startMonth}月${startDay}日 ${startHours}:${startMinutes} 〜 ${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
}
