import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, FileText, Plus } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { formatTimeWithDayBoundary, formatDisplayDateJST, parseTimestamp } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { BlockTag, TAG_CONFIG, TAGS } from '@/lib/categoryUtils';
import { useCustomTags, TAG_COLORS } from '@/hooks/useCustomTags';
import { TagFilterDropdown } from './TagFilterDropdown';
import { BlockEditModal } from '@/components/flow/BlockEditModal';
import { QuickAddModal } from './QuickAddModal';
import { icons } from 'lucide-react';
import { toast } from 'sonner';
import { useTargetBlockHighlight } from '@/hooks/useTargetBlockHighlight';

type TagFilter = 'all' | BlockTag | string;

interface MemosViewProps {
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

export function MemosView({ targetBlockId, onBlockScrolled, onSearchCleared }: MemosViewProps) {
  const { dayBoundaryHour } = useDayBoundary();
  const { getBlocksByCategory, updateBlock, deleteBlock } = useEntries();
  const { customTags } = useCustomTags();
  const [memos, setMemos] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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

  useTargetBlockHighlight({
    targetBlockId,
    enabled: !loading && memos.length > 0,
    onTargetHandled: onBlockScrolled,
    onHighlightCleared: onSearchCleared,
  });

  const filteredMemos = useMemo(() => {
    if (tagFilter === 'all') return memos;
    return memos.filter(m => m.tag === tagFilter);
  }, [memos, tagFilter]);

  const handleTagChange = (value: string | null) => {
    setTagFilter(value || 'all');
  };

  // 編集保存ハンドラー
  const handleEditSave = async (updates: BlockUpdatePayload & { images?: string[] }) => {
    if (!editingBlock) return;
    const updated = await updateBlock(editingBlock.id, updates);
    if (updated) {
      setMemos(prev => {
        const mapped = prev.map(m => m.id === editingBlock.id ? updated : m);
        // 再ソート（occurred_at DESC）
        return mapped.sort((a, b) => 
          parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime()
        );
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
      setMemos(prev => prev.filter(m => m.id !== editingBlock.id));
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
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">メモ</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredMemos.length}件{tagFilter !== 'all' && ` / 全${memos.length}件`}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="bg-purple-500 hover:bg-purple-600 text-white gap-1"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">追加</span>
          </Button>
        </div>
        
        {/* Tag Filter Dropdown */}
        <div className="mt-4">
          <TagFilterDropdown
            value={tagFilter === 'all' ? null : tagFilter}
            onChange={handleTagChange}
            customTags={customTags}
          />
        </div>
      </div>

      {/* Memos List */}
      {filteredMemos.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
            <FileText className="w-8 h-8 text-purple-500" />
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
                id={`block-${memo.id}`}
                className="p-4 rounded-xl bg-card border border-border cursor-pointer hover:shadow-md transition-all"
                onClick={() => setEditingBlock(memo)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex-shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {hasContent && (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap break-anywhere">
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
                      {getTagDisplay(memo.tag)}
                      <span>{formatDisplayDateJST(memo.occurred_at, dayBoundaryHour)}</span>
                      <span>•</span>
                      <span>{formatTimeWithDayBoundary(memo.occurred_at, dayBoundaryHour)}</span>
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
        category="thought"
        onBlockAdded={(block) => {
          setMemos(prev => {
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
