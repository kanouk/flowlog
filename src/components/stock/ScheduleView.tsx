import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { BlockEditModal } from '@/components/flow/BlockEditModal';
import { formatScheduleRange, CATEGORY_CONFIG } from '@/lib/categoryUtils';
import { TagFilterDropdown } from './TagFilterDropdown';

export function ScheduleView() {
  const { getBlocksByCategory, updateBlock, deleteBlock } = useEntries();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlocksByCategory('schedule', { limit: 200 });
      // starts_at でソート（昇順：未来から近い順）
      const sorted = data.sort((a, b) => {
        const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
        const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
        return aTime - bTime;
      });
      setBlocks(sorted);
    } finally {
      setLoading(false);
    }
  }, [getBlocksByCategory]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const handleEditSave = async (updates: BlockUpdatePayload & { images?: string[] }) => {
    if (!editingBlock) return;
    const updated = await updateBlock(editingBlock.id, updates);
    if (updated) {
      setBlocks(prev => prev.map(b => b.id === editingBlock.id ? updated : b));
    }
    setEditingBlock(null);
  };

  const handleDelete = async (blockId: string) => {
    const success = await deleteBlock(blockId);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    }
  };

  // フィルタ適用
  const now = new Date();
  const filtered = blocks.filter(block => {
    // タグフィルタ
    if (filterTag && block.tag !== filterTag) return false;
    
    // 過去のスケジュール
    if (!showPast && block.starts_at) {
      const startTime = new Date(block.starts_at);
      if (startTime < now) return false;
    }
    
    return true;
  });

  // 過去と未来で分ける
  const futureBlocks = filtered.filter(b => {
    if (!b.starts_at) return true;
    return new Date(b.starts_at) >= now;
  });
  
  const pastBlocks = blocks.filter(b => {
    if (filterTag && b.tag !== filterTag) return false;
    if (!b.starts_at) return false;
    return new Date(b.starts_at) < now;
  });

  const config = CATEGORY_CONFIG['schedule'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex items-center gap-2">
        <TagFilterDropdown value={filterTag} onChange={setFilterTag} />
      </div>

      {/* 未来のスケジュール */}
      {futureBlocks.length === 0 && !showPast ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 mb-4">
            <CalendarClock className="h-8 w-8 text-cyan-500" />
          </div>
          <p className="text-muted-foreground">予定はありません</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Flow画面からスケジュールを追加できます
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {futureBlocks.map(block => (
            <div
              key={block.id}
              onClick={() => setEditingBlock(block)}
              className="block-card p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${config.bgColor}`}>
                  <CalendarClock className={`h-5 w-5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${config.color}`}>
                    {formatScheduleRange(block.starts_at, block.ends_at, block.is_all_day)}
                  </div>
                  {block.content && (
                    <p className="text-foreground mt-1 line-clamp-2">{block.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 過去のスケジュール表示トグル */}
      {pastBlocks.length > 0 && (
        <div className="pt-4 border-t border-border">
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            過去のスケジュール ({pastBlocks.length})
          </button>
          
          {showPast && (
            <div className="mt-3 space-y-2">
              {pastBlocks.map(block => (
                <div
                  key={block.id}
                  onClick={() => setEditingBlock(block)}
                  className="block-card p-4 cursor-pointer hover:shadow-md transition-shadow opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                      <CalendarClock className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${config.color}`}>
                        {formatScheduleRange(block.starts_at, block.ends_at, block.is_all_day)}
                      </div>
                      {block.content && (
                        <p className="text-foreground mt-1 line-clamp-2">{block.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 編集モーダル */}
      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          open={!!editingBlock}
          onOpenChange={(open) => !open && setEditingBlock(null)}
          onSave={handleEditSave}
          onDelete={() => {
            handleDelete(editingBlock.id);
            setEditingBlock(null);
          }}
        />
      )}
    </div>
  );
}