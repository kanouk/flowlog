import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, CheckSquare, Plus, SlidersHorizontal, X, Clock, AlertTriangle } from 'lucide-react';
import { icons } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import { formatTimeWithDayBoundary, formatDisplayDateJST, parseTimestamp } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { useCustomTags, TAG_COLORS } from '@/hooks/useCustomTags';
import { TagFilterDropdown } from './TagFilterDropdown';
import { PriorityFilterDropdown } from './PriorityFilterDropdown';
import { BlockEditModal } from '@/components/flow/BlockEditModal';
import { QuickAddModal } from './QuickAddModal';
import { PriorityIndicator } from '@/components/flow/PrioritySelector';
import { PRIORITY_CONFIG, TaskPriority } from '@/lib/taskPriority';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTargetBlockHighlight } from '@/hooks/useTargetBlockHighlight';

type TaskFilter = 'all' | 'incomplete';
type TagFilter = 'all' | BlockTag | string;
type PriorityFilter = 'all' | TaskPriority;

interface TasksViewProps {
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

export function TasksView({ targetBlockId, onBlockScrolled, onSearchCleared }: TasksViewProps) {
  const { dayBoundaryHour } = useDayBoundary();
  const { getBlocksByCategory, updateBlock, deleteBlock } = useEntries();
  const { customTags } = useCustomTags();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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

  useTargetBlockHighlight({
    targetBlockId,
    enabled: !loading && blocks.length > 0,
    onTargetHandled: onBlockScrolled,
    onHighlightCleared: onSearchCleared,
  });

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    if (filter === 'incomplete') {
      result = result.filter(b => !b.is_done);
    }
    if (tagFilter !== 'all') {
      result = result.filter(b => b.tag === tagFilter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter(b => (b.priority || 0) === priorityFilter);
    }
    return result;
  }, [blocks, filter, priorityFilter, tagFilter]);

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
      // Re-sort: incomplete first (sorted by priority then occurred_at), completed by done_at
      return updated.sort((a, b) => {
        if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
        if (a.is_done && b.is_done) {
          const aTime = a.done_at ? parseTimestamp(a.done_at).getTime() : parseTimestamp(a.occurred_at).getTime();
          const bTime = b.done_at ? parseTimestamp(b.done_at).getTime() : parseTimestamp(b.occurred_at).getTime();
          return bTime - aTime;
        }
        // Incomplete: sort by priority DESC, then occurred_at DESC
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
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

  const activeTagLabel = useMemo(() => {
    if (tagFilter === 'all') return null;
    if (TAGS.includes(tagFilter as BlockTag)) {
      return TAG_CONFIG[tagFilter as BlockTag].label;
    }
    return customTags.find((tag) => tag.id === tagFilter)?.name ?? null;
  }, [customTags, tagFilter]);

  const hasActiveFilters = filter !== 'all' || tagFilter !== 'all' || priorityFilter !== 'all';

  // 編集保存ハンドラー
  const handleEditSave = async (updates: BlockUpdatePayload & { images?: string[] }) => {
    if (!editingBlock) return;
    const updated = await updateBlock(editingBlock.id, updates);
    if (updated) {
    setBlocks(prev => {
      const mapped = prev.map(b => b.id === editingBlock.id ? updated : b);
      // 再ソート (priority対応)
      return mapped.sort((a, b) => {
        if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
        if (a.is_done && b.is_done) {
          const aTime = a.done_at ? parseTimestamp(a.done_at).getTime() : parseTimestamp(a.occurred_at).getTime();
          const bTime = b.done_at ? parseTimestamp(b.done_at).getTime() : parseTimestamp(b.occurred_at).getTime();
          return bTime - aTime;
        }
        // Incomplete: sort by priority DESC, then occurred_at DESC
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
      });
    });
      toast.success('更新しました');
    }
    setEditingBlock(null);
  };

  // 削除ハンドラー
  const handleEditDelete = async () => {
    if (!editingBlock) return;
    const success = await deleteBlock(editingBlock.id);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== editingBlock.id));
      toast.success('削除しました');
    }
    setEditingBlock(null);
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
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">追加</span>
          </Button>
        </div>
        
        {/* Filters */}
        <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            フィルタ
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 text-xs font-medium text-muted-foreground">状態</span>
                <div className="inline-flex rounded-full border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      filter === 'all'
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    すべて
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('incomplete')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      filter === 'incomplete'
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    未完了
                  </button>
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setTagFilter('all');
                    setPriorityFilter('all');
                  }}
                  className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                  フィルタをクリア
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-10 text-xs font-medium text-muted-foreground">タグ</span>
                <TagFilterDropdown
                  value={tagFilter === 'all' ? null : tagFilter}
                  onChange={handleTagChange}
                  customTags={customTags}
                  className="h-9 rounded-full px-3"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-xs font-medium text-muted-foreground">優先</span>
                <PriorityFilterDropdown
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2">
                {filter === 'incomplete' && (
                  <span className="inline-flex items-center rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600">
                    状態: 未完了
                  </span>
                )}
                {activeTagLabel && (
                  <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                    タグ: {activeTagLabel}
                  </span>
                )}
                {priorityFilter !== 'all' && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
                    PRIORITY_CONFIG[priorityFilter].bgColor,
                    PRIORITY_CONFIG[priorityFilter].color
                  )}>
                    優先: {PRIORITY_CONFIG[priorityFilter].label}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      {filteredBlocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500/10 mb-4">
            <CheckSquare className="w-8 h-8 text-orange-500" />
          </div>
          <p className="text-muted-foreground">
            {filter === 'incomplete' || tagFilter !== 'all' || priorityFilter !== 'all'
              ? '該当するタスクはありません'
              : 'タスクがありません'}
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
                id={`block-${block.id}`}
                className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                  block.is_done 
                    ? 'bg-muted/30 border-border opacity-60' 
                    : 'bg-card border-border'
                }`}
                onClick={() => setEditingBlock(block)}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="mt-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <TaskCheckbox
                      checked={block.is_done}
                      onToggle={() => handleTaskToggle(block)}
                    />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      {/* Priority Indicator */}
                      <PriorityIndicator priority={block.priority || 0} className="mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        {hasContent && (
                          <p className={`text-foreground leading-relaxed whitespace-pre-wrap break-anywhere ${
                            block.is_done ? 'line-through text-muted-foreground' : ''
                          }`}>
                            {block.content}
                          </p>
                        )}
                      </div>
                    </div>
                    
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
                      {/* Deadline display */}
                      {block.due_at && (
                        <>
                          <span>•</span>
                          {(() => {
                            const isOverdue = !block.is_done && new Date(block.due_at) < new Date();
                            const dueDate = new Date(block.due_at);
                            const dueMonth = dueDate.getMonth() + 1;
                            const dueDay = dueDate.getDate();
                            const dueLabel = block.due_all_day 
                              ? `${dueMonth}/${dueDay} 終日`
                              : `${dueMonth}/${dueDay} ${String(dueDate.getHours()).padStart(2,'0')}:${String(dueDate.getMinutes()).padStart(2,'0')}`;
                            return (
                              <span className={cn(
                                "inline-flex items-center gap-0.5",
                                isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                              )}>
                                {isOverdue && <AlertTriangle className="h-3 w-3" />}
                                <Clock className="h-3 w-3" />
                                期限: {dueLabel}
                                {isOverdue && ' (期限切れ)'}
                              </span>
                            );
                          })()}
                        </>
                      )}
                      {block.is_done && block.done_at && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400">
                            ✓ {formatDateJST(block.done_at)} {formatTimeJST(block.done_at)} 完了
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

      {/* 編集モーダル */}
      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          open={!!editingBlock}
          onOpenChange={(open) => !open && setEditingBlock(null)}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      )}

      {/* 追加モーダル */}
      <QuickAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        category="task"
        onBlockAdded={(block) => {
          setBlocks(prev => {
            const updated = [block, ...prev];
            return updated.sort((a, b) => {
              if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
              // Incomplete: sort by priority DESC, then occurred_at DESC
              const priorityDiff = (b.priority || 0) - (a.priority || 0);
              if (priorityDiff !== 0) return priorityDiff;
              return parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
            });
          });
        }}
      />
    </div>
  );
}
