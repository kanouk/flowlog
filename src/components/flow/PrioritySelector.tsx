import { Flag } from 'lucide-react';
import { SelectableControl } from '@/components/ui/selectable-control';
import { PRIORITIES, PRIORITY_CONFIG, TaskPriority } from '@/lib/taskPriority';

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
          <SelectableControl
            key={priority}
            onClick={() => onChange(priority)}
            disabled={disabled}
            appearance="pill"
            size="pill"
            selected={isSelected}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              isSelected 
                ? `${config.bgColor} ${config.color} ring-1.5 ring-offset-1 ${config.activeRing}`
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Flag className="h-3 w-3" />
            {config.label}
          </SelectableControl>
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
