import { format, isToday, isYesterday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Calendar, ChevronRight } from 'lucide-react';
import { Entry } from '@/hooks/useEntries';

interface DateListProps {
  entries: Entry[];
  onSelect: (date: string) => void;
  selectedDate?: string;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return '今日';
  if (isYesterday(date)) return '昨日';
  return format(date, 'M月d日（E）', { locale: ja });
}

export function DateList({ entries, onSelect, selectedDate }: DateListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">
          まだログがありません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelect(entry.date)}
          className={`
            w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all
            ${selectedDate === entry.date
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
            }
          `}
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {formatDateLabel(entry.date)}
            </p>
            {entry.summary && (
              <p className={`text-sm truncate mt-0.5 ${
                selectedDate === entry.date 
                  ? 'text-primary-foreground/80' 
                  : 'text-muted-foreground'
              }`}>
                {entry.summary}
              </p>
            )}
          </div>
          <ChevronRight className={`h-4 w-4 flex-shrink-0 ${
            selectedDate === entry.date 
              ? 'text-primary-foreground' 
              : 'text-muted-foreground'
          }`} />
        </button>
      ))}
    </div>
  );
}
