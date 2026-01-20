import { useEffect, useState, useCallback } from 'react';
import { Loader2, Brain } from 'lucide-react';
import { useEntries, Block } from '@/hooks/useEntries';
import { formatTimeJST, formatDateJST } from '@/lib/dateUtils';
import { CATEGORY_CONFIG } from '@/lib/categoryUtils';

export function MemosView() {
  const { getBlocksByCategory } = useEntries();
  const [memos, setMemos] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const config = CATEGORY_CONFIG.thought;

  const loadMemos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlocksByCategory('thought', { limit: 100 });
      setMemos(data);
    } finally {
      setLoading(false);
    }
  }, [getBlocksByCategory]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with category color */}
      <div className={`flex items-center gap-4 p-5 rounded-xl border ${config.bgColor} ${config.borderColor}`}>
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/20 ${config.color}`}>
          <Brain className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">メモ</h2>
          <p className="text-sm text-muted-foreground">
            {memos.length}件
          </p>
        </div>
      </div>

      {/* Memos List */}
      {memos.length === 0 ? (
        <div className="text-center py-12">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${config.bgColor} mb-4`}>
            <Brain className={`w-8 h-8 ${config.color}`} />
          </div>
          <p className="text-muted-foreground">メモがありません</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowでメモを追加すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {memos.map((memo) => {
            const hasContent = memo.content && memo.content.trim().length > 0;
            const hasImages = memo.images && memo.images.length > 0;
            
            return (
              <div 
                key={memo.id} 
                className={`p-4 rounded-xl border ${config.bgColor} ${config.borderColor}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20 ${config.color} flex-shrink-0`}>
                    <Brain className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {hasContent && (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {memo.content}
                      </p>
                    )}
                    
                    {hasImages && (
                      <div className={`grid gap-2 ${hasContent ? 'mt-3' : ''} ${memo.images!.length === 1 ? 'grid-cols-1 max-w-xs' : memo.images!.length === 2 ? 'grid-cols-2 max-w-sm' : 'grid-cols-3 max-w-md'}`}>
                        {memo.images!.map((url, i) => (
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
                      <span>{formatDateJST(memo.occurred_at)}</span>
                      <span>•</span>
                      <span>{formatTimeJST(memo.occurred_at)}</span>
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
