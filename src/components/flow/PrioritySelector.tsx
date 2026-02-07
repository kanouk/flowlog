import { Flag } from 'lucide-react';

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

interface PrioritySelectorProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  disabled?: boolean;
}

export function PrioritySelector({ value, onChange, disabled }: PrioritySelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground mr-1">優先度:</span>
      {PRIORITIES.map((priority) => {
        const config = PRIORITY_CONFIG[priority];
        const isSelected = value === priority;
        
        return (
          <button
            key={priority}
            type="button"
            onClick={() => onChange(priority)}
            disabled={disabled}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              isSelected 
                ? `${config.bgColor} ${config.color} ring-1.5 ring-offset-1 ${config.activeRing}`
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Flag className="h-3 w-3" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// Display component for showing priority in lists
interface PriorityIndicatorProps {
  priority: number;
  className?: string;
}

export function PriorityIndicator({ priority, className = '' }: PriorityIndicatorProps) {
  if (priority === 0) return null;
  
  const config = PRIORITY_CONFIG[priority as TaskPriority] || PRIORITY_CONFIG[0];
  
  return (
    <Flag className={`h-3.5 w-3.5 ${config.color} ${className}`} />
  );
}
