import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BlockSearchResult {
  id: string;
  content: string | null;
  category: string;
  tag: string | null;
  occurred_at: string;
  entry_id: string;
  url_metadata: unknown;
}

export interface EntrySearchResult {
  id: string;
  date: string;
  formatted_content: string | null;
  summary: string | null;
}

export interface SearchResults {
  blocks: BlockSearchResult[];
  entries: EntrySearchResult[];
}

export function useSearch() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const search = useCallback(async (searchQuery: string) => {
    if (!user || !searchQuery.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);

    try {
      // ブロックと日記を並行検索
      const [blocksResponse, entriesResponse] = await Promise.all([
        supabase
          .from('blocks')
          .select('id, content, category, tag, occurred_at, entry_id, url_metadata')
          .or(`content.ilike.%${searchQuery}%,url_metadata->>summary.ilike.%${searchQuery}%`)
          .order('occurred_at', { ascending: false })
          .limit(10),
        supabase
          .from('entries')
          .select('id, date, formatted_content, summary')
          .or(`formatted_content.ilike.%${searchQuery}%,summary.ilike.%${searchQuery}%`)
          .order('date', { ascending: false })
          .limit(10),
      ]);

      setResults({
        blocks: blocksResponse.data || [],
        entries: entriesResponse.data || [],
      });
    } catch (error) {
      console.error('Search error:', error);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // デバウンス処理
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      search(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, search]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(null);
    setIsOpen(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    isOpen,
    setIsOpen,
    clearSearch,
  };
}
