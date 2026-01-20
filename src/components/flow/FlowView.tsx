import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, CalendarDays, Sun } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { useEntries, Block, Entry, AddBlockMode, BlockUpdatePayload } from '@/hooks/useEntries';
import { toast } from 'sonner';
import { getTodayKey, parseTimestamp, getOccurredAtDayKey, formatDateJST, calculateMiddleOccurredAt } from '@/lib/dateUtils';
import { BlockCategory } from '@/lib/categoryUtils';
import { arrayMove } from '@dnd-kit/sortable';

interface FlowViewProps {
  selectedDate: string;
  onNavigateToDate?: (date: string) => void;
}

/**
 * ブロックを降順にソート（occurred_at, created_at）
 */
function sortBlocksDesc(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => {
    const diff = parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
    if (diff !== 0) return diff;
    return parseTimestamp(b.created_at).getTime() - parseTimestamp(a.created_at).getTime();
  });
}

export function FlowView({ selectedDate, onNavigateToDate }: FlowViewProps) {
  const today = getTodayKey();
  const isToday = selectedDate === today;

  const { 
    formatting, 
    getBlocksByDate,
    getEntry,
    addBlockWithDate,
    deleteBlock,
    updateBlock,
    formatEntry,
    summarizeUrl,
  } = useEntries();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entryData = await getEntry(selectedDate);
      setEntry(entryData);
      
      const blocksData = await getBlocksByDate(selectedDate);
      setBlocks(blocksData);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, getEntry, getBlocksByDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * URLを抽出するヘルパー
   */
  const extractFirstUrl = (text: string): string | null => {
    const urlRegex = /(https?:\/\/[^\s]+)/i;
    const match = text.match(urlRegex);
    return match ? match[1] : null;
  };

  /**
   * 自動日記生成（出来事ブロックのみ）
   */
  const triggerAutoFormat = useCallback(async (targetDate: string) => {
    try {
      const entryData = await getEntry(targetDate);
      const blocksData = await getBlocksByDate(targetDate);
      
      // 「出来事」カテゴリのブロックのみ抽出
      const eventBlocks = blocksData.filter(b => b.category === 'event');
      
      if (entryData && eventBlocks.length > 0) {
        await formatEntry(entryData.id, eventBlocks, targetDate);
      }
    } catch (error) {
      console.error('Auto format error:', error);
      // 自動整形のエラーは静かに処理（トースト不要）
    }
  }, [getEntry, getBlocksByDate, formatEntry]);

  /**
   * ブロック追加（楽観的更新 + 遷移処理 + 画像対応 + カテゴリ対応 + 自動サマライズ）
   */
  const handleAddBlock = async (content: string, mode: AddBlockMode, images: string[] = [], category: BlockCategory = 'event') => {
    const tempId = `temp-${Date.now()}`;
    const optimisticBlock: Block = {
      id: tempId,
      entry_id: entry?.id || '',
      user_id: '',
      content,
      images: [],
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      category,
      is_done: false,
      done_at: null,
      url_metadata: null,
    };
    
    if (mode !== 'toNow' || isToday) {
      setBlocks(prev => sortBlocksDesc([...prev, optimisticBlock]));
    }
    
    const { block: savedBlock, navigateToDate } = await addBlockWithDate({
      content,
      selectedDate,
      mode,
      images,
      category,
    });
    
    if (savedBlock) {
      if (navigateToDate) {
        onNavigateToDate?.(navigateToDate);
        toast.success(`今日（${formatDateJST(new Date().toISOString())}）に追加しました`);
      } else {
        setBlocks(prev => sortBlocksDesc(prev.map(b => b.id === tempId ? savedBlock : b)));
      }

      // 「あとで読む」カテゴリでURLが含まれている場合は自動サマライズ
      if (category === 'read_later') {
        const url = extractFirstUrl(content);
        if (url) {
          // バックグラウンドでサマライズ（awaitしない）
          summarizeUrl(savedBlock.id, url).then(metadata => {
            if (metadata) {
              setBlocks(prev => prev.map(b => 
                b.id === savedBlock.id ? { ...b, url_metadata: metadata } : b
              ));
            }
          });
        }
      }

      // 「出来事」カテゴリの場合、自動日記生成
      if (category === 'event') {
        const targetDate = navigateToDate || selectedDate;
        triggerAutoFormat(targetDate);
      }
    } else {
      setBlocks(prev => prev.filter(b => b.id !== tempId));
    }
  };

  /**
   * ブロック削除
   */
  const handleDeleteBlock = async (blockId: string) => {
    // 削除前にブロックのカテゴリを確認
    const blockToDelete = blocks.find(b => b.id === blockId);
    const wasEvent = blockToDelete?.category === 'event';
    
    const success = await deleteBlock(blockId);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
      
      // 「出来事」カテゴリの場合、自動日記再生成
      if (wasEvent) {
        triggerAutoFormat(selectedDate);
      }
    }
  };

  /**
   * ブロック更新（汎用）
   */
  const handleUpdateBlock = async (blockId: string, updates: BlockUpdatePayload) => {
    const originalBlocks = [...blocks];
    const blockToUpdate = blocks.find(b => b.id === blockId);
    const isEvent = blockToUpdate?.category === 'event';
    
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, ...updates } : b
    ));
    
    const updated = await updateBlock(blockId, updates);
    
    if (!updated) {
      setBlocks(originalBlocks);
    } else if (updates.occurred_at) {
      const newDayKey = getOccurredAtDayKey(updates.occurred_at);
      if (newDayKey !== selectedDate) {
        setBlocks(prev => prev.filter(b => b.id !== blockId));
        toast.success(`${formatDateJST(updates.occurred_at)}に移動しました`);
        
        // 「出来事」カテゴリの場合、両方の日の日記を再生成
        if (isEvent) {
          triggerAutoFormat(selectedDate);
          triggerAutoFormat(newDayKey);
        }
      } else {
        setBlocks(prev => sortBlocksDesc(prev));
        
        // 「出来事」カテゴリの場合、日記を再生成
        if (isEvent) {
          triggerAutoFormat(selectedDate);
        }
      }
    } else if (isEvent && (updates.content !== undefined)) {
      // 内容更新の場合も日記を再生成
      triggerAutoFormat(selectedDate);
    }
  };

  /**
   * D&D並び替え
   */
  const handleDragEnd = async (activeId: string, overId: string) => {
    const oldIndex = blocks.findIndex(b => b.id === activeId);
    const newIndex = blocks.findIndex(b => b.id === overId);
    
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const originalBlocks = [...blocks];
    const newBlocks = arrayMove(blocks, oldIndex, newIndex);
    setBlocks(newBlocks);

    const prevBlock = newIndex > 0 ? newBlocks[newIndex - 1] : null;
    const nextBlock = newIndex < newBlocks.length - 1 ? newBlocks[newIndex + 1] : null;

    const result = calculateMiddleOccurredAt(
      prevBlock?.occurred_at || null,
      nextBlock?.occurred_at || null,
      selectedDate
    );

    if (result.success === false) {
      toast.error(result.reason);
      setBlocks(originalBlocks);
      return;
    }

    const newOccurredAt = result.occurredAt;
    const blockToMove = blocks.find(b => b.id === activeId);
    const isEvent = blockToMove?.category === 'event';

    const updated = await updateBlock(activeId, { occurred_at: newOccurredAt });
    
    if (!updated) {
      setBlocks(originalBlocks);
    } else {
      setBlocks(prev => sortBlocksDesc(
        prev.map(b => b.id === activeId ? { ...b, occurred_at: newOccurredAt } : b)
      ));
      
      // 「出来事」カテゴリの場合、日記を再生成
      if (isEvent) {
        triggerAutoFormat(selectedDate);
      }
    }
  };

  const formattedDate = format(new Date(selectedDate), 'M月d日（E）', { locale: ja });

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
      <div className={`flex items-center gap-4 p-5 rounded-xl border ${isToday ? 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20' : 'bg-muted/30 border-border'}`}>
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${isToday ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {isToday ? <Sun className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold text-foreground">
              {isToday ? '今日のログ' : formattedDate}
            </h2>
            {isToday ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary">
                今日
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                過去
              </span>
            )}
          </div>
          {isToday && (
            <p className="text-muted-foreground mt-1 text-sm">
              {formattedDate}
            </p>
          )}
        </div>
      </div>

      {/* Input Form */}
      <FlowInput 
        onSubmit={handleAddBlock}
        selectedDate={selectedDate}
        isToday={isToday}
      />
      
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary/60" />
          <h3 className="text-base font-medium text-foreground">
            {isToday ? '今日のログ' : 'この日のログ'}
          </h3>
          <span className="text-xs text-muted-foreground">
            {blocks.length > 0 ? `${blocks.length}件` : ''}
          </span>
        </div>
        
        {/* 自動整形中のインジケータ */}
        {formatting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            日記生成中...
          </div>
        )}
      </div>
      
      <BlockList 
        blocks={blocks} 
        onDelete={handleDeleteBlock}
        onUpdate={handleUpdateBlock}
        onDragEnd={handleDragEnd}
        showDelete={true}
        editable={true}
        selectedDate={selectedDate}
      />
    </div>
  );
}
