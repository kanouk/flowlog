import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, CheckSquare, Square, CheckSquare as CheckSquareIcon } from 'lucide-react';
import { icons } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { formatTimeJST, formatDateJST, parseTimestamp } from '@/lib/dateUtils';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { useCustomTags, TAG_COLORS } from '@/hooks/useCustomTags';
import { TagFilterDropdown } from './TagFilterDropdown';
import { toast } from 'sonner';

type TaskFilter = 'all' | 'incomplete';
type TagFilter = 'all' | BlockTag | string;

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

export function TasksView() {
  const { getBlocksByCategory, updateBlock } = useEntries();
  const { customTags } = useCustomTags();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlocksByCategory('task', { limit: 200 });
      setBlocks(data);
    } finally {
      setLoading(false);
    }
  }, [getBlocksByCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    if (filter === 'incomplete') {
      result = result.filter(b => !b.is_done);
    }
    if (tagFilter !== 'all') {
      result = result.filter(b => b.tag === tagFilter);
    }
    return result;
  }, [blocks, filter, tagFilter]);

  const handleTaskToggle = async (block: Block) => {
    const newIsDone = !block.is_done;
    const updates: BlockUpdatePayload = {
      is_done: newIsDone,
      done_at: newIsDone ? new Date().toISOString() : null,
    };
    
    // Optimistic update
    setBlocks(prev => {
      const updated = prev.map(b => 
        b.id === block.id ? { ...b, ...updates } : b
      );
      // Re-sort: incomplete first, then by occurred_at/done_at
      return updated.sort((a, b) => {
        if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
        if (a.is_done && b.is_done) {
          const aTime = a.done_at ? parseTimestamp(a.done_at).getTime() : parseTimestamp(a.occurred_at).getTime();
          const bTime = b.done_at ? parseTimestamp(b.done_at).getTime() : parseTimestamp(b.occurred_at).getTime();
          return bTime - aTime;
        }
        return parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
      });
    });
    
    const result = await updateBlock(block.id, updates);
    if (!result) {
      // Rollback on failure
      loadData();
      toast.error('更新に失敗しました');
    } else {
      toast.success(newIsDone ? '完了にしました' : '未完了に戻しました');
    }
  };

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

  const incompleteCount = blocks.filter(b => !b.is_done).length;
  const completedCount = blocks.filter(b => b.is_done).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-xl bg-card border border-border">
        {/* Title Row */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-500/10 text-orange-500">
            <CheckSquare className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">タスク</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              未完了 {incompleteCount}件 / 完了 {completedCount}件
            </p>
          </div>
        </div>
        
        {/* Filters */}
        <div className="mt-4 space-y-3">
          {/* Status Filter */}
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              className={`flex-1 sm:flex-none ${filter === 'all' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
            >
              すべて
            </Button>
            <Button
              variant={filter === 'incomplete' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('incomplete')}
              className={`flex-1 sm:flex-none ${filter === 'incomplete' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
            >
              未完了のみ
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

      {/* Task List */}
      {filteredBlocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500/10 mb-4">
            <CheckSquare className="w-8 h-8 text-orange-500" />
          </div>
          <p className="text-muted-foreground">
            {filter === 'incomplete' ? '未完了のタスクはありません' : 'タスクがありません'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flowでタスクを追加すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBlocks.map((block) => {
            const hasContent = block.content && block.content.trim().length > 0;
            const hasImages = block.images && block.images.length > 0;
            
            return (
              <div 
                key={block.id} 
                className={`p-4 rounded-xl border transition-all ${
                  block.is_done 
                    ? 'bg-muted/30 border-border opacity-60' 
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleTaskToggle(block)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {block.is_done ? (
                      <CheckSquareIcon className="h-5 w-5 text-orange-500" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground hover:text-orange-500 transition-colors" />
                    )}
                  </button>
                  
                  <div className="flex-1">
                    {hasContent && (
                      <p className={`text-foreground leading-relaxed whitespace-pre-wrap ${
                        block.is_done ? 'line-through text-muted-foreground' : ''
                      }`}>
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
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                      {getTagDisplay(block.tag)}
                      <span>{formatDateJST(block.occurred_at)}</span>
                      <span>•</span>
                      <span>{formatTimeJST(block.occurred_at)}</span>
                      {block.is_done && block.done_at && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400">
                            ✓ {formatDateJST(block.done_at)} 完了
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
    </div>
  );
}
