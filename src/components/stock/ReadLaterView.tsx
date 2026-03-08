import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { Loader2, Bookmark, ExternalLink, Sparkles, RefreshCw, FileText, Circle, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { icons } from 'lucide-react';
import { useEntries, Block, UrlMetadata } from '@/hooks/useEntries';
import { formatTimeWithDayBoundary, formatDisplayDateJST, formatTimeJST, formatDateJST, parseTimestamp } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { useCustomTags, TAG_COLORS } from '@/hooks/useCustomTags';
import { TagFilterDropdown } from './TagFilterDropdown';
import { QuickAddModal } from './QuickAddModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTargetBlockHighlight } from '@/hooks/useTargetBlockHighlight';

type TagFilter = 'all' | BlockTag | string;
type ReadFilter = 'all' | 'unread' | 'read';

interface ReadLaterViewProps {
  targetBlockId?: string | null;
  onBlockScrolled?: () => void;
  onSearchCleared?: () => void;
}

function kebabToPascal(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function getIconComponent(iconName: string) {
  const pascalName = kebabToPascal(iconName);
  return (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName];
}

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

export function ReadLaterView({ targetBlockId, onBlockScrolled, onSearchCleared }: ReadLaterViewProps) {
  const { getBlocksByCategory, summarizeUrl, updateBlock } = useEntries();
  const { customTags } = useCustomTags();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlocksByCategory('read_later', { limit: 200, includeCompleted: true });
      setBlocks(data);
    } finally {
      setLoading(false);
    }
  }, [getBlocksByCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useTargetBlockHighlight({
    targetBlockId,
    enabled: !loading && blocks.length > 0,
    onTargetHandled: onBlockScrolled,
    onHighlightCleared: onSearchCleared,
  });

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    
    // Tag filter
    if (tagFilter !== 'all') {
      result = result.filter(b => b.tag === tagFilter);
    }
    
    // Read filter
    if (readFilter === 'read') {
      result = result.filter(b => b.is_done);
    } else if (readFilter === 'unread') {
      result = result.filter(b => !b.is_done);
    }
    
    return result;
  }, [blocks, tagFilter, readFilter]);

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
      } else {
        // summarizeUrl returned null - store error state locally
        const errorMetadata: UrlMetadata = {
          url,
          title: '',
          summary: '',
          fetched_at: new Date().toISOString(),
          error: true,
          error_message: 'サマリーを取得できませんでした'
        };
        setBlocks(prev => prev.map(b => 
          b.id === blockId 
            ? { ...b, url_metadata: errorMetadata }
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

  const handleToggleRead = useCallback(async (blockId: string, newIsDone: boolean) => {
    setTogglingIds(prev => new Set(prev).add(blockId));
    try {
      const result = await updateBlock(blockId, { 
        is_done: newIsDone,
        done_at: newIsDone ? new Date().toISOString() : null
      });
      if (result) {
        setBlocks(prev => prev.map(b => 
          b.id === blockId 
            ? { ...b, is_done: newIsDone, done_at: newIsDone ? new Date().toISOString() : null }
            : b
        ));
      }
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    }
  }, [updateBlock]);

  const handleTagChange = (value: string | null) => {
    setTagFilter(value || 'all');
  };

  // Helper to get tag display for a block
  const getTagDisplay = (tag: string | null) => {
    if (!tag) return null;
    
    // Check base tags
    if (TAGS.includes(tag as BlockTag)) {
      const config = TAG_CONFIG[tag as BlockTag];
      const Icon = config.icon;
      return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
          <Icon className="h-3 w-3" />
        </span>
      );
    }
    
    // Check custom tags
    const customTag = customTags.find(t => t.id === tag);
    if (customTag) {
      const colorConfig = TAG_COLORS[customTag.color as keyof typeof TAG_COLORS];
      const IconComponent = getIconComponent(customTag.icon);
      if (IconComponent) {
        return (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${colorConfig?.bg || ''} ${colorConfig?.text || ''}`}>
            <IconComponent className="h-3 w-3" />
          </span>
        );
      }
    }
    
    return null;
  };

  // Stats
  const unreadCount = blocks.filter(b => !b.is_done).length;
  const readCount = blocks.filter(b => b.is_done).length;

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
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">あとで</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredBlocks.length}件表示 / 未読 {unreadCount}件 ・ 既読 {readCount}件
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="bg-green-500 hover:bg-green-600 text-white gap-1"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">追加</span>
          </Button>
        </div>
        
        {/* Filters */}
        <div className="mt-4 space-y-3">
          {/* Read Filter */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant={readFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReadFilter('all')}
              className={cn("h-8 text-xs px-2", readFilter === 'all' && 'bg-gray-500 hover:bg-gray-600')}
            >
              すべて
            </Button>
            <Button
              variant={readFilter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReadFilter('unread')}
              className={cn("h-8 text-xs px-2", readFilter === 'unread' && 'bg-green-500 hover:bg-green-600')}
            >
              <Circle className="h-3 w-3 mr-1" />
              未読
            </Button>
            <Button
              variant={readFilter === 'read' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReadFilter('read')}
              className={cn("h-8 text-xs px-2", readFilter === 'read' && 'bg-gray-400 hover:bg-gray-500')}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              既読
            </Button>
          </div>
          
          {/* Tag Filter Dropdown */}
          <TagFilterDropdown
            value={tagFilter === 'all' ? null : tagFilter}
            onChange={handleTagChange}
            customTags={customTags}
          />
        </div>
      </div>

      {/* Read Later List */}
      {filteredBlocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
            <Bookmark className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-muted-foreground">
            {tagFilter !== 'all' || readFilter !== 'all' ? '該当するものがありません' : 'まだ何もありません'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowで「あとで」を追加すると、ここに表示されます
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
            const isToggling = togglingIds.has(block.id);
            
            return (
              <div 
                key={block.id} 
                id={`block-${block.id}`}
                className={cn(
                  "p-4 rounded-xl bg-card border border-border transition-opacity",
                  block.is_done && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Read/Unread Toggle Button */}
                  <button
                    onClick={() => handleToggleRead(block.id, !block.is_done)}
                    disabled={isToggling}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-colors",
                      block.is_done 
                        ? "bg-muted text-muted-foreground hover:bg-muted/80" 
                        : "bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20"
                    )}
                  >
                    {isToggling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : block.is_done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                    {block.is_done ? '既読' : '未読'}
                  </button>
                  
                  <div className="flex-1">
                    {hasContent && (
                      <p className={cn(
                        "text-foreground leading-relaxed whitespace-pre-wrap break-anywhere",
                        block.is_done && "line-through"
                      )}>
                        {linkifyContent(block.content!)}
                      </p>
                    )}
                    
                    {/* URL Summary Section */}
                    {hasUrlMetadata && block.url_metadata && !block.url_metadata.error && (
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
                    
                    {/* URL Summary Error State */}
                    {hasUrlMetadata && block.url_metadata?.error && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/60">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{block.url_metadata.error_message || 'サマリーを取得できませんでした'}</span>
                        {extractedUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
                            onClick={() => handleSummarize(block.id, extractedUrl)}
                            disabled={isSummarizing}
                          >
                            {isSummarizing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                再試行
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                    
                    {/* Summarize Button for URLs without metadata (only if no error either) */}
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
                      {getTagDisplay(block.tag)}
                      <span>{formatDateJST(block.occurred_at)}</span>
                      <span>•</span>
                      <span>{formatTimeJST(block.occurred_at)}</span>
                      {block.is_done && block.done_at && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400">
                            ✓ {formatDateJST(block.done_at)} {formatTimeJST(block.done_at)} に既読
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 追加モーダル */}
      <QuickAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        category="read_later"
        onBlockAdded={(block) => {
          setBlocks(prev => {
            const updated = [block, ...prev];
            return updated.sort((a, b) => 
              parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime()
            );
          });
        }}
      />
    </div>
  );
}
