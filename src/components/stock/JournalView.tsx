import { useEffect, useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, Sparkles, BookOpen, CalendarDays } from 'lucide-react';
import { useEntries, Block, Entry, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { parseTimestamp, formatTimeJST, getTodayKey } from '@/lib/dateUtils';
import { CATEGORY_CONFIG, BlockCategory } from '@/lib/categoryUtils';
import { DateList } from '@/components/flow/DateList';
import { toast } from 'sonner';

interface JournalViewProps {
  entries: Entry[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function JournalView({ entries, selectedDate, onDateSelect }: JournalViewProps) {
  const { 
    getBlocksByDate, 
    getEntry, 
    formatEntry, 
    formatting,
    updateBlock,
  } = useEntries();
  
  const [entry, setEntry] = useState<Entry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const today = getTodayKey();
  const isToday = selectedDate === today;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entryData, blocksData] = await Promise.all([
        getEntry(selectedDate),
        getBlocksByDate(selectedDate)
      ]);
      setEntry(entryData);
      setBlocks(blocksData);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, getEntry, getBlocksByDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter to event/thought only, sort ascending
  const filteredBlocks = useMemo(() => {
    return blocks
      .filter(b => b.category === 'event' || b.category === 'thought')
      .sort((a, b) => 
        parseTimestamp(a.occurred_at).getTime() - parseTimestamp(b.occurred_at).getTime()
      );
  }, [blocks]);

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

  const handleFormat = async () => {
    if (filteredBlocks.length === 0) return;
    
    let currentEntry = entry;
    if (!currentEntry) {
      const entryData = await getEntry(selectedDate);
      currentEntry = entryData;
      setEntry(entryData);
    }
    
    if (!currentEntry) {
      toast.error('エントリが見つかりません');
      return;
    }
    
    const result = await formatEntry(currentEntry.id, filteredBlocks, selectedDate);
    if (result) {
      setEntry(prev => prev ? {
        ...prev,
        formatted_content: result.formatted_content,
        summary: result.summary,
      } : null);
    }
  };

  const formattedDate = format(new Date(selectedDate), 'M月d日（E）', { locale: ja });

  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-6">
      {/* Date List Sidebar */}
      <aside className="glass-card rounded-2xl p-4 h-fit sticky top-24">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">日付一覧</span>
        </div>
        <DateList 
          entries={entries} 
          onSelect={onDateSelect}
          selectedDate={selectedDate}
        />
      </aside>

      {/* Journal Content */}
      <div className="space-y-6">
        {/* Date Header */}
        <div className={`flex items-center gap-4 p-5 rounded-xl border ${isToday ? 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20' : 'bg-muted/30 border-border'}`}>
          <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${isToday ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-foreground">
              {isToday ? '今日の日記' : `${formattedDate}の日記`}
            </h2>
            {entry?.summary && (
              <p className="text-muted-foreground mt-1 text-sm">
                {entry.summary}
              </p>
            )}
          </div>
          {filteredBlocks.length > 0 && (
            <Button
              onClick={handleFormat}
              disabled={formatting}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {formatting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  整形中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  整形する
                </>
              )}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredBlocks.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">日記がありません</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              出来事や思ったことを記録すると、ここに表示されます
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Block List (ascending) */}
            {filteredBlocks.map((block) => {
              const config = CATEGORY_CONFIG[block.category as BlockCategory];
              const Icon = config?.icon;
              const hasContent = block.content && block.content.trim().length > 0;
              const hasImages = block.images && block.images.length > 0;
              
              return (
                <div key={block.id} className="block-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      {hasContent && (
                        <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                          {block.content}
                        </p>
                      )}
                      
                      {hasImages && (
                        <div className={`grid gap-2 ${hasContent ? 'mt-3' : ''} ${block.images!.length === 1 ? 'grid-cols-1 max-w-xs' : block.images!.length === 2 ? 'grid-cols-2 max-w-sm' : 'grid-cols-3 max-w-md'}`}>
                          {block.images!.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              className="w-full aspect-square object-cover rounded-md border border-border"
                            />
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config?.bgColor} ${config?.color}`}>
                          {Icon && <Icon className="h-3 w-3" />}
                          {config?.label}
                        </span>
                        <span className="timestamp-badge">
                          {formatTimeJST(block.occurred_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Formatted Content */}
            {sections.length > 0 && (
              <div className="space-y-6 mt-8 pt-6 border-t border-border">
                <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                  ✨ AI整形版
                </h3>
                {sections.map((section, index) => (
                  <div key={index} className="block-card p-5">
                    <h4 className="text-lg font-medium text-primary mb-3 flex items-center gap-2">
                      {section.title === '今日の3行まとめ' && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
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
          </div>
        )}
      </div>
    </div>
  );
}
