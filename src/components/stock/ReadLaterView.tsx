import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { Loader2, Bookmark, ExternalLink } from 'lucide-react';
import { useEntries, Block } from '@/hooks/useEntries';
import { formatTimeJST, formatDateJST } from '@/lib/dateUtils';

/**
 * URLを自動リンク化
 */
function linkifyContent(text: string): ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset regex lastIndex
      urlRegex.lastIndex = 0;
      return (
        <a 
          key={i} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          {part}
          <ExternalLink className="h-3 w-3 inline-block" />
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ReadLaterView() {
  const { getBlocksByCategory } = useEntries();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlocksByCategory('read_later', { limit: 200 });
      setBlocks(data);
    } finally {
      setLoading(false);
    }
  }, [getBlocksByCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/15 text-green-600 dark:text-green-400">
          <Bookmark className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">あとで読む</h2>
          <p className="text-sm text-muted-foreground">
            {blocks.length}件
          </p>
        </div>
      </div>

      {/* Read Later List */}
      {blocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Bookmark className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">あとで読むものがありません</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            あとで読むカテゴリで記録すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => {
            const hasContent = block.content && block.content.trim().length > 0;
            const hasImages = block.images && block.images.length > 0;
            
            return (
              <div key={block.id} className="block-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    {hasContent && (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {linkifyContent(block.content!)}
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
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{formatDateJST(block.occurred_at)}</span>
                      <span>{formatTimeJST(block.occurred_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
