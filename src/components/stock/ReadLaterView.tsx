import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { Loader2, Bookmark, ExternalLink, Sparkles, RefreshCw, FileText } from 'lucide-react';
import { useEntries, Block } from '@/hooks/useEntries';
import { formatTimeJST, formatDateJST } from '@/lib/dateUtils';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { Button } from '@/components/ui/button';

type TagFilter = 'all' | BlockTag;

/**
 * URLを検出して返す
 */
function extractFirstUrl(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

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
          className="text-green-600 dark:text-green-400 hover:underline inline-flex items-center gap-1"
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
  const { getBlocksByCategory, summarizeUrl } = useEntries();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');

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

  const filteredBlocks = useMemo(() => {
    if (tagFilter === 'all') return blocks;
    return blocks.filter(b => b.tag === tagFilter);
  }, [blocks, tagFilter]);

  const handleSummarize = useCallback(async (blockId: string, url: string) => {
    setSummarizingIds(prev => new Set(prev).add(blockId));
    try {
      const result = await summarizeUrl(blockId, url);
      if (result) {
        // Update local state with the new metadata
        setBlocks(prev => prev.map(b => 
          b.id === blockId 
            ? { ...b, url_metadata: result }
            : b
        ));
      }
    } finally {
      setSummarizingIds(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    }
  }, [summarizeUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-xl bg-card border border-border">
        {/* Title Row */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-500/10 text-green-500">
            <Bookmark className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">あとで読む</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredBlocks.length}件{tagFilter !== 'all' && ` / 全${blocks.length}件`}
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

      {/* Read Later List */}
      {filteredBlocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
            <Bookmark className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-muted-foreground">
            {tagFilter !== 'all' ? '該当するものがありません' : 'あとで読むものがありません'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowであとで読むを追加すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBlocks.map((block) => {
            const hasContent = block.content && block.content.trim().length > 0;
            const hasImages = block.images && block.images.length > 0;
            const extractedUrl = hasContent ? extractFirstUrl(block.content!) : null;
            const isSummarizing = summarizingIds.has(block.id);
            const hasUrlMetadata = block.url_metadata !== null;
            
            return (
              <div 
                key={block.id} 
                className="p-4 rounded-xl bg-card border border-border"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 text-green-500 flex-shrink-0">
                    <Bookmark className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1">
                    {hasContent && (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {linkifyContent(block.content!)}
                      </p>
                    )}
                    
                    {/* URL Summary Section */}
                    {hasUrlMetadata && block.url_metadata && (
                      <div className="bg-muted/50 p-3 rounded-lg mt-3 border-l-2 border-green-500/50">
                        <div className="flex items-start gap-2 mb-2">
                          <FileText className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                          <span className="text-sm font-medium text-foreground line-clamp-2">
                            {block.url_metadata.title}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {block.url_metadata.summary}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground/70">
                            {formatDateJST(block.url_metadata.fetched_at)} {formatTimeJST(block.url_metadata.fetched_at)} に取得
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-green-600 dark:text-green-400 hover:bg-green-500/10"
                            onClick={() => handleSummarize(block.id, block.url_metadata!.url)}
                            disabled={isSummarizing}
                          >
                            {isSummarizing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                再取得
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {/* Summarize Button for URLs without metadata */}
                    {!hasUrlMetadata && extractedUrl && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSummarize(block.id, extractedUrl)}
                          disabled={isSummarizing}
                          className="gap-1"
                        >
                          {isSummarizing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              要約を取得中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 text-green-500" />
                              要約
                            </>
                          )}
                        </Button>
                      </div>
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
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                      {block.tag && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${TAG_CONFIG[block.tag].bgColor} ${TAG_CONFIG[block.tag].color}`}>
                          {(() => { const Icon = TAG_CONFIG[block.tag].icon; return <Icon className="h-3 w-3" />; })()}
                        </span>
                      )}
                      <span>{formatDateJST(block.occurred_at)}</span>
                      <span>•</span>
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
