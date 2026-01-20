import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Brain } from 'lucide-react';
import { useEntries, Block } from '@/hooks/useEntries';
import { formatTimeJST, formatDateJST } from '@/lib/dateUtils';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { Button } from '@/components/ui/button';

type TagFilter = 'all' | BlockTag;

export function MemosView() {
  const { getBlocksByCategory } = useEntries();
  const [memos, setMemos] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');

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

  const filteredMemos = useMemo(() => {
    if (tagFilter === 'all') return memos;
    return memos.filter(m => m.tag === tagFilter);
  }, [memos, tagFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-xl bg-card border border-border">
        {/* Title Row */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-500/10 text-purple-500">
            <Brain className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">メモ</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredMemos.length}件{tagFilter !== 'all' && ` / 全${memos.length}件`}
            </p>
          </div>
        </div>
        
        {/* Tag Filter */}
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              variant={tagFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTagFilter('all')}
              className={`h-8 text-xs px-2 ${tagFilter === 'all' ? 'bg-gray-500 hover:bg-gray-600' : ''}`}
            >
              <span className="sm:hidden">全</span>
              <span className="hidden sm:inline">全タグ</span>
            </Button>
            {TAGS.map((t) => {
              const config = TAG_CONFIG[t];
              const Icon = config.icon;
              return (
                <Button
                  key={t}
                  variant={tagFilter === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTagFilter(t)}
                  className={`h-8 text-xs px-2 ${tagFilter === t ? `${config.bgColor} ${config.color}` : ''}`}
                >
                  <Icon className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">{config.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Memos List */}
      {filteredMemos.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
            <Brain className="w-8 h-8 text-purple-500" />
          </div>
          <p className="text-muted-foreground">
            {tagFilter !== 'all' ? '該当するメモがありません' : 'メモがありません'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowでメモを追加すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMemos.map((memo) => {
            const hasContent = memo.content && memo.content.trim().length > 0;
            const hasImages = memo.images && memo.images.length > 0;
            
            return (
              <div 
                key={memo.id} 
                className="p-4 rounded-xl bg-card border border-border"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex-shrink-0">
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
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                      {memo.tag && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${TAG_CONFIG[memo.tag].bgColor} ${TAG_CONFIG[memo.tag].color}`}>
                          {(() => { const Icon = TAG_CONFIG[memo.tag].icon; return <Icon className="h-3 w-3" />; })()}
                        </span>
                      )}
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
