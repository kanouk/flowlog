import { format, addDays, subDays, isToday as isTodayFn, isFuture } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useState } from 'react';
import { getTodayKey } from '@/lib/dateUtils';

interface DateNavigationProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  datesWithEntries?: string[];
}

export function DateNavigation({ selectedDate, onDateChange, datesWithEntries = [] }: DateNavigationProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = getTodayKey();
  const isToday = selectedDate === today;
  
  const selectedDateObj = new Date(selectedDate);
  const todayObj = new Date(today);

  const handlePrevDay = () => {
    const prevDate = subDays(selectedDateObj, 1);
    onDateChange(format(prevDate, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const nextDate = addDays(selectedDateObj, 1);
    // 未来の日付は許可しない
    if (!isFuture(nextDate) || isTodayFn(nextDate)) {
      onDateChange(format(nextDate, 'yyyy-MM-dd'));
    }
  };

  const handleToday = () => {
    onDateChange(today);
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(format(date, 'yyyy-MM-dd'));
      setCalendarOpen(false);
    }
  };

  // 次の日ボタンを無効にするか
  const isNextDisabled = isToday;

  // 日付表示テキスト
  const dateLabel = isToday 
    ? '今日' 
    : format(selectedDateObj, 'M/d（E）', { locale: ja });

  return (
    <div className="flex items-center gap-1">
      {/* 前日ボタン */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handlePrevDay}
        aria-label="前日"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* 日付表示 */}
      <span className={`text-sm font-medium min-w-[4rem] text-center ${isToday ? 'text-primary' : 'text-foreground'}`}>
        {dateLabel}
      </span>

      {/* 次日ボタン */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleNextDay}
        disabled={isNextDisabled}
        aria-label="次日"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* 今日ボタン（過去日のみ表示） */}
      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-primary"
          onClick={handleToday}
        >
          今日
        </Button>
      )}

      {/* カレンダーポップオーバー */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="カレンダー">
            <CalendarDays className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDateObj}
            onSelect={handleCalendarSelect}
            disabled={(date) => isFuture(date) && !isTodayFn(date)}
            locale={ja}
            modifiers={{
              hasEntry: datesWithEntries.map(d => new Date(d)),
            }}
            modifiersClassNames={{
              hasEntry: 'has-entry',
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
