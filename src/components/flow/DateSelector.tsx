import { useState, useMemo } from 'react';
import { format, isToday, isYesterday, isFuture, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Calendar as CalendarIcon, List, ChevronRight } from 'lucide-react';
import { Entry } from '@/hooks/useEntries';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DateSelectorProps {
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

// LocalStorage key for view mode persistence
const VIEW_MODE_KEY = 'flowlog_date_selector_view';

export function DateSelector({ entries, onSelect, selectedDate }: DateSelectorProps) {
  const [viewMode, setViewMode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(VIEW_MODE_KEY) || 'calendar';
    }
    return 'calendar';
  });

  // Calculate dates with entries for calendar modifiers
  const datesWithEntries = useMemo(() => {
    const dates = new Set<string>();
    entries.forEach(entry => {
      dates.add(entry.date);
    });
    return dates;
  }, [entries]);

  // Selected date as Date object for calendar
  const selectedDateObj = useMemo(() => {
    if (!selectedDate) return undefined;
    return startOfDay(new Date(selectedDate));
  }, [selectedDate]);

  // Handle view mode change with persistence
  const handleViewModeChange = (mode: string) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // Handle calendar date selection
  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    onSelect(dateStr);
  };

  // Check if a date has entries (for calendar modifiers)
  const hasEntry = (date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return datesWithEntries.has(dateStr);
  };

  return (
    <Tabs value={viewMode} onValueChange={handleViewModeChange} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="calendar" className="gap-1.5 text-xs">
          <CalendarIcon className="h-3.5 w-3.5" />
          カレンダー
        </TabsTrigger>
        <TabsTrigger value="list" className="gap-1.5 text-xs">
          <List className="h-3.5 w-3.5" />
          リスト
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calendar" className="mt-0">
        <Calendar
          mode="single"
          selected={selectedDateObj}
          onSelect={handleCalendarSelect}
          locale={ja}
          disabled={(date) => isFuture(startOfDay(date))}
          modifiers={{
            hasEntry: (date) => hasEntry(date),
          }}
          modifiersClassNames={{
            hasEntry: 'has-entry',
          }}
          className="p-0 pointer-events-auto"
          classNames={{
            months: "flex flex-col",
            month: "space-y-2",
            caption: "flex justify-center pt-1 relative items-center px-8",
            caption_label: "text-sm font-medium",
            nav: "space-x-1 flex items-center",
            nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent hover:text-accent-foreground",
            nav_button_previous: "absolute left-0",
            nav_button_next: "absolute right-0",
            table: "w-full border-collapse",
            head_row: "flex justify-between",
            head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]",
            row: "flex w-full mt-1 justify-between",
            cell: "relative h-8 w-8 text-center text-sm p-0 focus-within:relative focus-within:z-20",
            day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center",
            day_range_end: "day-range-end",
            day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "bg-accent text-accent-foreground font-semibold",
            day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
            day_disabled: "text-muted-foreground opacity-30",
            day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
            day_hidden: "invisible",
          }}
        />
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>投稿あり</span>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="list" className="mt-0">
        {entries.length === 0 ? (
          <div className="text-center py-8">
            <CalendarIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              まだログがありません
            </p>
          </div>
        ) : (
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
        )}
      </TabsContent>
    </Tabs>
  );
}
