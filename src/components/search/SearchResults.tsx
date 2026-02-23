import { useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle2, FileText, Calendar, StickyNote, BookmarkCheck, BookOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { SearchResults as SearchResultsType } from '@/hooks/useSearch';

interface SearchResultsProps {
  results: SearchResultsType | null;
  loading: boolean;
  query: string;
  onSelectBlock: (date: string, blockId: string) => void;
  onSelectEntry: (date: string) => void;
  selectedIndex?: number;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'task':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />;
    case 'memo':
      return <StickyNote className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />;
    case 'schedule':
      return <Calendar className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />;
    case 'read_later':
      return <BookmarkCheck className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
  }
};

const formatDate = (dateString: string) => {
  try {
    const date = parseISO(dateString);
    return format(date, 'M/d', { locale: ja });
  } catch {
    return '';
  }
};

const truncateText = (text: string | null, maxLength: number = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

const highlightMatch = (text: string, query: string) => {
  if (!query.trim()) return text;
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    i % 2 === 1 ? (
      <mark key={i} className="bg-yellow-300 dark:bg-yellow-500/50 text-foreground rounded px-0.5">
        {part}
      </mark>
    ) : part
  );
};

export function SearchResults({ 
  results, 
  loading, 
  query, 
  onSelectBlock, 
  onSelectEntry,
  selectedIndex = -1
}: SearchResultsProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedIndex < 0 || !selectedRef.current) return;
    const el = selectedRef.current;
    const viewport = el.closest('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const elRect = el.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    if (elRect.bottom > vpRect.bottom) {
      viewport.scrollTop += elRect.bottom - vpRect.bottom;
    } else if (elRect.top < vpRect.top) {
      viewport.scrollTop -= vpRect.top - elRect.top;
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!results || (!results.blocks.length && !results.entries.length)) {
    if (query.trim()) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <p className="text-sm">「{query}」の検索結果はありません</p>
        </div>
      );
    }
    return null;
  }

  const totalCount = results.blocks.length + results.entries.length;

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="p-3">
        <p className="text-xs text-muted-foreground mb-3 px-1">
          「{query}」の検索結果（{totalCount}件）
        </p>

        {results.blocks.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                ブロック ({results.blocks.length}件)
              </span>
            </div>
            <div className="space-y-1">
              {results.blocks.map((block, index) => {
                const dateKey = block.occurred_at.split('T')[0];
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={block.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => onSelectBlock(dateKey, block.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                      isSelected ? 'bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    {getCategoryIcon(block.category)}
                    <span className="text-xs text-muted-foreground min-w-[32px]">
                      {formatDate(block.occurred_at)}
                    </span>
                    <span className="text-sm truncate flex-1">
                      {highlightMatch(truncateText(block.content, 40), query)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {results.entries.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                日記 ({results.entries.length}件)
              </span>
            </div>
            <div className="space-y-1">
              {results.entries.map((entry, index) => {
                const isSelected = (results.blocks.length + index) === selectedIndex;
                return (
                  <button
                    key={entry.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => onSelectEntry(entry.date)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                      isSelected ? 'bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    <BookOpen className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground min-w-[32px]">
                      {formatDate(entry.date)}
                    </span>
                    <span className="text-sm truncate flex-1">
                      {highlightMatch(truncateText(entry.summary || entry.formatted_content, 40), query)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
