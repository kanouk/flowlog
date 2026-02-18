import { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSearch } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';
import { useIsMobile } from '@/hooks/use-mobile';

interface SearchBarProps {
  onNavigateToDate: (date: string, tab?: string, blockId?: string, query?: string) => void;
}

export function SearchBar({ onNavigateToDate }: SearchBarProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const { 
    query, 
    setQuery, 
    results, 
    loading, 
    isOpen, 
    setIsOpen, 
    clearSearch 
  } = useSearch();

  const handleSelectBlock = (date: string, blockId: string) => {
    onNavigateToDate(date, 'flow', blockId, query);
    clearSearch();
  };

  const handleSelectEntry = (date: string) => {
    onNavigateToDate(date, 'journal');
    clearSearch();
  };

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
            placeholder="検索..."
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
        className="w-80 p-0" 
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SearchResults
          results={results}
          loading={loading}
          query={query}
          onSelectBlock={handleSelectBlock}
          onSelectEntry={handleSelectEntry}
        />
      </PopoverContent>
    </Popover>
  );
}
