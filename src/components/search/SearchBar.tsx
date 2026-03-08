import { useRef, useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSearch } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';
import { useIsMobile } from '@/hooks/use-mobile';
import { getOccurredAtDayKey } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';

interface SearchBarProps {
  onNavigateToDate: (date: string, tab?: string, blockId?: string, query?: string) => void;
}

const categoryToTab = (category: string) => {
  switch (category) {
    case 'task':
      return 'tasks';
    case 'thought':
      return 'memos';
    case 'schedule':
      return 'schedule';
    case 'read_later':
      return 'readLater';
    default:
      return 'flow';
  }
};

export function SearchBar({ onNavigateToDate }: SearchBarProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { 
    query, 
    setQuery, 
    results, 
    loading, 
    isOpen, 
    setIsOpen, 
    clearSearch 
  } = useSearch();

  const totalResults = results
    ? results.blocks.length + results.entries.length
    : 0;

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const handleSelectBlock = (date: string, blockId: string, category: string) => {
    onNavigateToDate(date, categoryToTab(category), blockId, query);
    clearSearch();
    setSelectedIndex(-1);
  };

  const handleSelectEntry = (date: string) => {
    onNavigateToDate(date, 'journal');
    clearSearch();
    setSelectedIndex(-1);
  };

  const handleSelectByIndex = useCallback((index: number) => {
    if (!results || index < 0) return;

    if (index < results.blocks.length) {
      const block = results.blocks[index];
      const dateKey = block.occurred_at.split('T')[0];
      onNavigateToDate(dateKey, categoryToTab(block.category), block.id, query);
    } else {
      const entryIndex = index - results.blocks.length;
      if (entryIndex < results.entries.length) {
        const entry = results.entries[entryIndex];
        onNavigateToDate(entry.date, 'journal');
      }
    }
    clearSearch();
    setSelectedIndex(-1);
  }, [results, query, onNavigateToDate, clearSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearSearch();
      inputRef.current?.blur();
      return;
    }

    if (totalResults === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev < totalResults - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : totalResults - 1
      );
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectByIndex(selectedIndex);
    }
  }, [totalResults, selectedIndex, handleSelectByIndex, clearSearch]);

  // Ctrl+K グローバルショートカット
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.key === 'k')) return;

      e.preventDefault();
      if (isMobile) {
        setIsOpen(true);
      } else {
        inputRef.current?.focus();
        inputRef.current?.select();
        if (query.trim()) {
          setIsOpen(true);
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isMobile, setIsOpen, query]);

  // モバイル: ダイアログ形式
  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="flex-shrink-0"
        >
          <Search className="h-5 w-5" />
        </Button>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-md p-0">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="sr-only">検索</DialogTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="ブロック・日記を検索..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9 pr-9"
                  autoFocus
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogHeader>
            <SearchResults
              results={results}
              loading={loading}
              query={query}
              onSelectBlock={handleSelectBlock}
              onSelectEntry={handleSelectEntry}
              selectedIndex={selectedIndex}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // デスクトップ: ポップオーバー形式
  return (
    <Popover open={isOpen && (!!query.trim() || loading)} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-48 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="検索... (Ctrl+K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) {
                setIsOpen(true);
              }
            }}
            onFocus={() => {
              if (query.trim()) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            className="pl-9 pr-9 h-9"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="h-[min(32rem,calc(100vh-6rem))] w-[min(32rem,calc(100vw-2rem))] overflow-hidden p-0" 
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SearchResults
          results={results}
          loading={loading}
          query={query}
          onSelectBlock={handleSelectBlock}
          onSelectEntry={handleSelectEntry}
          selectedIndex={selectedIndex}
        />
      </PopoverContent>
    </Popover>
  );
}
