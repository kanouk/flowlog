import { useState } from 'react';
import { BookOpen, ListTodo, Bookmark } from 'lucide-react';
import { Entry } from '@/hooks/useEntries';
import { JournalView } from './JournalView';
import { TasksView } from './TasksView';
import { ReadLaterView } from './ReadLaterView';

type StockSubTab = 'journal' | 'tasks' | 'readLater';

interface StockViewProps {
  entries: Entry[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function StockView({ entries, selectedDate, onDateSelect }: StockViewProps) {
  const [subTab, setSubTab] = useState<StockSubTab>('journal');

  const tabClass = (tab: StockSubTab) => 
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      subTab === tab 
        ? 'bg-primary text-primary-foreground' 
        : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-border pb-3">
        <button onClick={() => setSubTab('journal')} className={tabClass('journal')}>
          <BookOpen className="h-4 w-4" />
          日記
        </button>
        <button onClick={() => setSubTab('tasks')} className={tabClass('tasks')}>
          <ListTodo className="h-4 w-4" />
          タスク
        </button>
        <button onClick={() => setSubTab('readLater')} className={tabClass('readLater')}>
          <Bookmark className="h-4 w-4" />
          あとで読む
        </button>
      </div>

      {/* Content */}
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
      
      {subTab === 'readLater' && (
        <ReadLaterView />
      )}
    </div>
  );
}
