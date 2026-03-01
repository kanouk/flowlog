import { ChevronDown, Flag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIORITY_CONFIG, TaskPriority } from '@/lib/taskPriority';
import { cn } from '@/lib/utils';

interface PriorityFilterDropdownProps {
  value: TaskPriority | 'all';
  onChange: (value: TaskPriority | 'all') => void;
  className?: string;
}

export function PriorityFilterDropdown({
  value,
  onChange,
  className,
}: PriorityFilterDropdownProps) {
  const isFiltering = value !== 'all';
  const currentConfig = value === 'all' ? null : PRIORITY_CONFIG[value];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isFiltering
              ? `${currentConfig?.bgColor} ${currentConfig?.color} border-current/15`
              : 'border-border bg-background text-foreground hover:bg-muted',
            className
          )}
        >
          <Flag className={cn('h-4 w-4', currentConfig?.color)} />
          <span>{value === 'all' ? 'すべて' : currentConfig?.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem onClick={() => onChange('all')} className={cn(value === 'all' && 'bg-muted')}>
          <Flag className="mr-2 h-4 w-4 text-muted-foreground" />
          すべて
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {([3, 2, 1, 0] as TaskPriority[]).map((priority) => {
          const config = PRIORITY_CONFIG[priority];
          return (
            <DropdownMenuItem
              key={priority}
              onClick={() => onChange(priority)}
              className={cn(value === priority && 'bg-muted')}
            >
              <Flag className={cn('mr-2 h-4 w-4', config.color)} />
              {config.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
