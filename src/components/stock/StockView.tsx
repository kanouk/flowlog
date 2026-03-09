import { useState, useCallback, useRef } from 'react';
import { BookOpen, ListTodo, Bookmark, FileText, CalendarClock } from 'lucide-react';
import { Entry } from '@/hooks/useEntries';
import { JournalView } from './JournalView';
import { TasksView } from './TasksView';
import { ReadLaterView } from './ReadLaterView';
import { MemosView } from './MemosView';
import { ScheduleView } from './ScheduleView';

type StockSubTab = 'journal' | 'tasks' | 'memos' | 'readLater' | 'schedule';

const TAB_ORDER: StockSubTab[] = ['journal', 'tasks', 'schedule', 'memos', 'readLater'];

interface StockViewProps {
  entries: Entry[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

// タブとカテゴリ色のマッピング
const TAB_COLORS: Record<StockSubTab, { active: string; hover: string }> = {
  journal: { 
    active: 'bg-blue-500 text-white', 
    hover: 'hover:bg-blue-500/10 hover:text-blue-600' 
  },
  tasks: { 
    active: 'bg-orange-500 text-white', 
    hover: 'hover:bg-orange-500/10 hover:text-orange-600' 
  },
  memos: { 
    active: 'bg-purple-500 text-white', 
    hover: 'hover:bg-purple-500/10 hover:text-purple-600' 
  },
  readLater: { 
    active: 'bg-green-500 text-white', 
    hover: 'hover:bg-green-500/10 hover:text-green-600' 
  },
  schedule: { 
    active: 'bg-cyan-500 text-white', 
    hover: 'hover:bg-cyan-500/10 hover:text-cyan-600' 
  },
};

export function StockView({ entries, selectedDate, onDateSelect }: StockViewProps) {
  const [subTab, setSubTab] = useState<StockSubTab>('journal');
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const prevTabRef = useRef<StockSubTab>(subTab);

  // タブ切り替え（方向を記録）
  const switchTab = useCallback((newTab: StockSubTab) => {
    const currentIndex = TAB_ORDER.indexOf(subTab);
    const newIndex = TAB_ORDER.indexOf(newTab);
    
    if (newIndex > currentIndex) {
      setSlideDirection('left'); // 右から入ってくる
    } else if (newIndex < currentIndex) {
      setSlideDirection('right'); // 左から入ってくる
    }
    
    prevTabRef.current = subTab;
    setSubTab(newTab);
  }, [subTab]);

  const tabClass = (tab: StockSubTab) => {
    const colors = TAB_COLORS[tab];
    return `flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      subTab === tab 
        ? colors.active
        : `text-muted-foreground ${colors.hover}`
    }`;
  };

  // アニメーションクラスを取得
  const getAnimationClass = () => {
    if (!slideDirection) return 'animate-fade-in';
    return slideDirection === 'left' ? 'animate-slide-in-left' : 'animate-slide-in-right';
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs - モバイルではアイコンのみ */}
      <div className="flex gap-1 sm:gap-2 border-b border-border pb-3">
        <button onClick={() => switchTab('journal')} className={tabClass('journal')}>
          <BookOpen className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">日記</span>
        </button>
        <button onClick={() => switchTab('tasks')} className={tabClass('tasks')}>
          <ListTodo className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">タスク</span>
        </button>
        <button onClick={() => switchTab('schedule')} className={tabClass('schedule')}>
          <CalendarClock className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">予定</span>
        </button>
        <button onClick={() => switchTab('memos')} className={tabClass('memos')}>
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">メモ</span>
        </button>
        <button onClick={() => switchTab('readLater')} className={tabClass('readLater')}>
          <Bookmark className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">あとで</span>
        </button>
      </div>

      {/* Content with slide animation */}
      <div key={subTab} className={getAnimationClass()}>
        {subTab === 'journal' && (
          <JournalView 
            entries={entries}
            selectedDate={selectedDate} 
            onDateSelect={onDateSelect}
          />
        )}
        
        {subTab === 'tasks' && (
          <TasksView />
        )}
        
        {subTab === 'memos' && (
          <MemosView />
        )}
        
        {subTab === 'readLater' && (
          <ReadLaterView />
        )}
        
        {subTab === 'schedule' && (
          <ScheduleView />
        )}
      </div>
    </div>
  );
}
