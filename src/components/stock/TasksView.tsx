import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, ListTodo, Square, CheckSquare as CheckSquareIcon, Filter } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { formatTimeJST, formatDateJST, parseTimestamp } from '@/lib/dateUtils';
import { CATEGORY_CONFIG } from '@/lib/categoryUtils';
import { toast } from 'sonner';

type TaskFilter = 'all' | 'incomplete';

export function TasksView() {
  const { getBlocksByCategory, updateBlock } = useEntries();
  
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>('all');

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
    if (filter === 'incomplete') {
      return blocks.filter(b => !b.is_done);
    }
    return blocks;
  }, [blocks, filter]);

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

  const incompleteCount = blocks.filter(b => !b.is_done).length;
  const completedCount = blocks.filter(b => b.is_done).length;

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <ListTodo className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">タスク</h2>
            <p className="text-sm text-muted-foreground">
              未完了 {incompleteCount}件 / 完了 {completedCount}件
            </p>
          </div>
        </div>
        
        {/* Filter */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            すべて
          </Button>
          <Button
            variant={filter === 'incomplete' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('incomplete')}
          >
            未完了のみ
          </Button>
        </div>
      </div>

      {/* Task List */}
      {filteredBlocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <ListTodo className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {filter === 'incomplete' ? '未完了のタスクはありません' : 'タスクがありません'}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            タスクカテゴリで記録すると、ここに表示されます
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
                className={`block-card p-4 transition-opacity ${block.is_done ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleTaskToggle(block)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {block.is_done ? (
                      <CheckSquareIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400 transition-colors" />
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
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{formatDateJST(block.occurred_at)}</span>
                      <span>{formatTimeJST(block.occurred_at)}</span>
                      {block.is_done && block.done_at && (
                        <span className="text-green-600 dark:text-green-400">
                          ✓ {formatDateJST(block.done_at)} 完了
                        </span>
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
