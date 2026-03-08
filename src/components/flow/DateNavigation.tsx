import { format, addDays, subDays, isToday as isTodayFn, isFuture } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useState } from 'react';
import { getTodayKey } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';

interface DateNavigationProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  datesWithEntries?: string[];
}

export function DateNavigation({ selectedDate, onDateChange, datesWithEntries = [] }: DateNavigationProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { dayBoundaryHour } = useDayBoundary();
  const today = getTodayKey(dayBoundaryHour);
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

  // 日付フォーマット
  const formattedDate = format(selectedDateObj, 'M月d日（E）', { locale: ja });

  return (
    <div 
      className={`
        w-full flex items-center px-2 py-1.5 rounded-xl transition-all duration-200
        ${isToday 
          ? 'bg-gradient-to-r from-primary/5 via-primary/8 to-primary/5' 
          : 'bg-muted/40'
        }
      `}
    >
      {/* 前日ボタン */}
      <button
        onClick={handlePrevDay}
        className={`
          flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0
          transition-all duration-200 hover:scale-110 active:scale-95
          ${isToday 
            ? 'text-primary hover:bg-primary/10' 
            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
          }
        `}
        aria-label="前日"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* 中央エリア：日付表示（カレンダー付き） */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button 
              className={`
                flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg
                transition-all duration-200 active:scale-[0.98]
                ${isToday 
                  ? 'hover:bg-primary/10' 
                  : 'hover:bg-background/60'
                }
              `}
              aria-label="カレンダー"
            >
              {isToday ? (
                <>
                  <Sun className="h-[18px] w-[18px] text-primary flex-shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-base sm:text-lg font-semibold text-primary">今日</span>
                    <span className="text-xs sm:text-sm text-muted-foreground">{formattedDate}</span>
                  </div>
                </>
              ) : (
                <>
                  <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-base sm:text-lg font-semibold text-foreground">{formattedDate}</span>
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
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
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* 次日ボタン */}
      <button
        onClick={handleNextDay}
        disabled={isNextDisabled}
        className={`
          flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0
          transition-all duration-200
          ${isNextDisabled 
            ? 'text-muted-foreground/30 cursor-not-allowed' 
            : isToday
              ? 'text-primary hover:bg-primary/10 hover:scale-110 active:scale-95'
              : 'text-muted-foreground hover:bg-background/80 hover:text-foreground hover:scale-110 active:scale-95'
          }
        `}
        aria-label="次日"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* 今日に戻るボタン（過去日のみ表示） */}
      {!isToday && (
        <>
          <div className="w-px h-5 bg-border mx-1.5 flex-shrink-0" />
          <button
            onClick={handleToday}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95 flex-shrink-0 whitespace-nowrap"
          >
            <Sun className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">今日に戻る</span>
            <span className="sm:hidden">今日</span>
          </button>
        </>
      )}
    </div>
  );
}
