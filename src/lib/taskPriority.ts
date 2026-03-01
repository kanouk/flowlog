export type TaskPriority = 0 | 1 | 2 | 3;

export const PRIORITY_CONFIG: Record<TaskPriority, {
  label: string;
  color: string;
  bgColor: string;
  activeRing: string;
}> = {
  0: {
    label: 'なし',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    activeRing: 'ring-muted-foreground',
  },
  1: {
    label: '低',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    activeRing: 'ring-green-500',
  },
  2: {
    label: '中',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    activeRing: 'ring-yellow-500',
  },
  3: {
    label: '高',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    activeRing: 'ring-red-500',
  },
};

export const PRIORITIES: TaskPriority[] = [0, 1, 2, 3];
