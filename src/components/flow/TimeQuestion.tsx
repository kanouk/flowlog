import { useState } from 'react';
import { Sun, Cloud, Sunset, Moon, X, Clock3, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type Timeframe = 'morning' | 'noon' | 'evening' | 'night';

interface TimeQuestionProps {
  blockId: string;
  contentPreview: string;
  question: string;
  onAnswer: (blockId: string, timeframe: Timeframe) => void;
  onAnswerExactTime: (blockId: string, time: string) => void;
  onDismiss: (blockId: string) => void;
}

const TIMEFRAME_CONFIG: Record<Timeframe, { label: string; icon: typeof Sun; time: string; color: string }> = {
  morning: { 
    label: '朝', 
    icon: Sun, 
    time: '08:00',
    color: 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30',
  },
  noon: { 
    label: '昼', 
    icon: Cloud, 
    time: '12:00',
    color: 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30',
  },
  evening: { 
    label: '夕方', 
    icon: Sunset, 
    time: '18:00',
    color: 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30',
  },
  night: { 
    label: '夜', 
    icon: Moon, 
    time: '21:00',
    color: 'text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30',
  },
};

export function TimeQuestion({ 
  blockId, 
  contentPreview, 
  question,
  onAnswer, 
  onAnswerExactTime,
  onDismiss 
}: TimeQuestionProps) {
  const [showExactTimeInput, setShowExactTimeInput] = useState(false);
  const [exactTime, setExactTime] = useState('19:00');
  const displayQuestion = question.includes('何時') ? 'いつごろですか？' : question;

  return (
    <div className="bg-muted/50 border border-border rounded-lg p-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">
            「{contentPreview}」
          </p>
          <p className="text-sm font-medium text-foreground mt-0.5">
            {displayQuestion}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            正確な時刻じゃなくて大丈夫です
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onDismiss(blockId)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.entries(TIMEFRAME_CONFIG) as [Timeframe, typeof TIMEFRAME_CONFIG[Timeframe]][]).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              className={`h-8 px-3 gap-1.5 ${config.color}`}
              onClick={() => onAnswer(blockId, key)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs">{config.label}</span>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowExactTimeInput(prev => !prev)}
        >
          <Pencil className="h-3.5 w-3.5" />
          時刻を入れる
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onDismiss(blockId)}
        >
          わからない
        </Button>
      </div>

      {showExactTimeInput && (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative w-28">
            <Clock3 className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="time"
              value={exactTime}
              onChange={(e) => setExactTime(e.target.value)}
              className="h-8 pl-7 pr-2 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => onAnswerExactTime(blockId, exactTime)}
          >
            この時刻で保存
          </Button>
        </div>
      )}
    </div>
  );
}

export function getTimeFromTimeframe(timeframe: Timeframe): string {
  return TIMEFRAME_CONFIG[timeframe].time;
}
