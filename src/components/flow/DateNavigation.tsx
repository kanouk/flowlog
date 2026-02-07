import { format, addDays, subDays, isToday as isTodayFn, isFuture } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays, Sun } from 'lucide-react';
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

  // 日付フォーマット
  const formattedDate = format(selectedDateObj, 'M月d日（E）', { locale: ja });

  return (
    <div 
      className={`
        flex items-center gap-2 px-4 py-3 rounded-xl border shadow-sm transition-all duration-200
        ${isToday 
          ? 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20' 
          : 'bg-muted/50 border-border'
        }
      `}
    >
      {/* 前日ボタン */}
      <button
        onClick={handlePrevDay}
        className={`
          flex items-center justify-center w-10 h-10 rounded-full 
          transition-all duration-200 hover:scale-110 active:scale-95
          ${isToday 
            ? 'text-primary hover:bg-primary/10' 
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }
        `}
        aria-label="前日"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* 日付表示エリア */}
      <div className="flex-1 text-center min-w-[120px]">
        {isToday ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold text-primary">今日</span>
            </div>
            <span className="text-sm text-muted-foreground">{formattedDate}</span>
          </>
        ) : (
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-foreground">{formattedDate}</span>
          </div>
        )}
      </div>

      {/* 今日ボタン（過去日のみ表示） */}
      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToday}
          className="text-primary hover:text-primary hover:bg-primary/10 font-medium"
        >
          今日へ
        </Button>
      )}

      {/* 次日ボタン */}
      <button
        onClick={handleNextDay}
        disabled={isNextDisabled}
        className={`
          flex items-center justify-center w-10 h-10 rounded-full 
          transition-all duration-200
          ${isNextDisabled 
            ? 'text-muted-foreground/30 cursor-not-allowed' 
            : isToday
              ? 'text-primary hover:bg-primary/10 hover:scale-110 active:scale-95'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95'
          }
        `}
        aria-label="次日"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* カレンダーポップオーバー */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button 
            className={`
              flex items-center justify-center w-10 h-10 rounded-full 
              transition-all duration-200 hover:scale-110 active:scale-95
              ${isToday 
                ? 'text-primary hover:bg-primary/10' 
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            `}
            aria-label="カレンダー"
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
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
  );
}
