import { useEffect, useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, BookOpen, CalendarDays, ArrowLeft } from 'lucide-react';
import { useEntries, Entry } from '@/hooks/useEntries';
import { getTodayKey } from '@/lib/dateUtils';
import { DateSelector } from '@/components/flow/DateSelector';
import { useIsMobile } from '@/hooks/use-mobile';

interface JournalViewProps {
  entries: Entry[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function JournalView({ entries, selectedDate, onDateSelect }: JournalViewProps) {
  const { getEntry } = useEntries();
  
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const today = getTodayKey();
  const isToday = selectedDate === today;
  
  // モバイルでは今日の場合はデフォルトでコンテンツを表示
  const [showContent, setShowContent] = useState(isToday);

  // Handle mobile date selection
  const handleMobileDateSelect = (date: string) => {
    onDateSelect(date);
    if (isMobile) {
      setShowContent(true);
    }
  };

  // Handle back to date selection (mobile)
  const handleBackToDateSelection = () => {
    setShowContent(false);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entryData = await getEntry(selectedDate);
      setEntry(entryData);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, getEntry]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // AI formatted content sections
  const sections = useMemo(() => {
    const content = entry?.formatted_content;
    if (!content) return [];

    const parts = content.split(/(?=^## )/m);
    return parts.filter(p => p.trim()).map(section => {
      const lines = section.trim().split('\n');
      const title = lines[0]?.replace(/^##\s*/, '').trim() || '';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    });
  }, [entry?.formatted_content]);

  const formattedDate = format(new Date(selectedDate), 'M月d日（E）', { locale: ja });

  // Date Header component - シンプルなデザイン
  const DateHeader = () => (
    <div className="flex items-center gap-4 p-5 rounded-xl bg-card border border-border">
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500">
        <BookOpen className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl md:text-2xl font-semibold text-foreground truncate">
          {isToday ? '今日の日記' : `${formattedDate}の日記`}
        </h2>
      </div>
    </div>
  );

  // Journal Content component - プレーンなデザイン
  const JournalContent = () => (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : !entry?.formatted_content ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
            <BookOpen className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-muted-foreground">日記がまだ生成されていません</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowで出来事を記録すると、自動的に日記が生成されます
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div 
              key={index} 
              className="p-5 rounded-xl bg-card border border-border"
            >
              <h4 className="text-lg font-medium text-foreground mb-3 flex items-center gap-2">
                {section.title === '今日の3行まとめ' && (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 text-sm">
                    ✨
                  </span>
                )}
                {section.title === '朝' && '🌅'}
                {section.title === '昼' && '☀️'}
                {section.title === '夕方' && '🌇'}
                {section.title === '夜' && '🌙'}
                {section.title}
              </h4>
              <div className="prose prose-sm max-w-none text-foreground/90">
                {section.body.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 last:mb-0 leading-relaxed">
                    {line.replace(/^[-*]\s*/, '• ')}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Mobile: Step-based UI
  if (isMobile) {
    return showContent ? (
      <div className="space-y-4">
        {/* Back button */}
        <button 
          onClick={handleBackToDateSelection}
          className="flex items-center gap-2 text-blue-500 hover:opacity-80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">日付を選択</span>
        </button>
        
        {/* Date Header and Content */}
        <DateHeader />
        <JournalContent />
      </div>
    ) : (
      <div className="space-y-4">
        {/* Date selection header */}
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">日付を選択してください</span>
        </div>
        
        {/* Date Selector */}
        <DateSelector 
          entries={entries} 
          onSelect={handleMobileDateSelect}
          selectedDate={selectedDate}
        />
      </div>
    );
  }

  // Desktop: Title full-width, then two-column layout
  return (
    <div className="space-y-6">
      {/* Title Card - Full width */}
      <DateHeader />
      
      {/* Two-column layout */}
      <div className="grid md:grid-cols-[240px_1fr] gap-6 w-full overflow-hidden items-start">
        {/* Date List Sidebar */}
        <aside className="rounded-2xl p-4 h-fit sticky top-24 bg-card border border-border max-w-[240px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">日付一覧</span>
          </div>
          <DateSelector 
            entries={entries} 
            onSelect={onDateSelect}
            selectedDate={selectedDate}
          />
        </aside>

        {/* Journal Content */}
        <div className="min-w-0 overflow-hidden">
          <JournalContent />
        </div>
      </div>
    </div>
  );
}
