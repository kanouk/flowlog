import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { DateNavigation } from '@/components/flow/DateNavigation';
import { TimeQuestion, getTimeFromTimeframe, Timeframe } from '@/components/flow/TimeQuestion';
import { useEntries, Block, Entry, AddBlockMode, BlockUpdatePayload, TimeQuestion as TimeQuestionType } from '@/hooks/useEntries';
import { toast } from 'sonner';
import { getTodayKey, parseTimestamp, getOccurredAtDayKey, formatDisplayDateJST, calculateMiddleOccurredAt, createOccurredAt } from '@/lib/dateUtils';
import { BlockCategory, BlockTag } from '@/lib/categoryUtils';
import { arrayMove } from '@dnd-kit/sortable';
import { useTargetBlockHighlight } from '@/hooks/useTargetBlockHighlight';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { addDays, subDays, format, isFuture, isToday as isTodayFn } from 'date-fns';

interface FlowViewProps {
  selectedDate: string;
  onNavigateToDate?: (date: string) => void;
  onDateChange: (date: string) => void;
  datesWithEntries?: string[];
  targetBlockId?: string | null;
  onBlockScrolled?: () => void;
  searchQuery?: string | null;
  onSearchCleared?: () => void;
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

export function FlowView({ selectedDate, onNavigateToDate, onDateChange, datesWithEntries = [], targetBlockId, onBlockScrolled, searchQuery, onSearchCleared }: FlowViewProps) {
  const { dayBoundaryHour } = useDayBoundary();
  const isMobile = useIsMobile();
  const today = getTodayKey(dayBoundaryHour);
  const isToday = selectedDate === today;
  const dateSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

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
  const [pendingQuestions, setPendingQuestions] = useState<TimeQuestionType[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entryData = await getEntry(selectedDate);
      setEntry(entryData);
      
      const blocksData = await getBlocksByDate(selectedDate, dayBoundaryHour);
      setBlocks(blocksData);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, getEntry, getBlocksByDate, dayBoundaryHour]);

  useEffect(() => {
    loadData();
    // 日付が変わったら質問をクリア
    setPendingQuestions([]);
  }, [loadData, selectedDate]);

  useTargetBlockHighlight({
    targetBlockId,
    enabled: !loading && blocks.length > 0,
    onTargetHandled: onBlockScrolled,
    onHighlightCleared: onSearchCleared,
  });

  /**
   * URLを抽出するヘルパー
   */
  const extractFirstUrl = (text: string): string | null => {
    const urlRegex = /(https?:\/\/[^\s]+)/i;
    const match = text.match(urlRegex);
    return match ? match[1] : null;
  };

  /**
   * 自動日記生成（出来事ブロックのみ）+ 時刻推測
   */
  const triggerAutoFormat = useCallback(async (targetDate: string) => {
    try {
      const entryData = await getEntry(targetDate);
      const blocksData = await getBlocksByDate(targetDate, dayBoundaryHour);
      
      // 「出来事」カテゴリのブロックのみ抽出
      const eventBlocks = blocksData.filter(b => b.category === 'event');
      
      if (entryData && eventBlocks.length > 0) {
        const result = await formatEntry(entryData.id, eventBlocks, targetDate, dayBoundaryHour);
        
        // 時刻が更新された場合、ブロックをリロード
        if (result?.time_updates && result.time_updates.length > 0) {
          const updatedBlocks = await getBlocksByDate(targetDate, dayBoundaryHour);
          setBlocks(updatedBlocks);
        }
        
        // 質問がある場合、質問リストに追加
        if (result?.needs_clarification && result.questions) {
          setPendingQuestions(prev => {
            // 重複を避ける
            const existingIds = new Set(prev.map(q => q.block_id));
            const newQuestions = result.questions!.filter(q => !existingIds.has(q.block_id));
            return [...prev, ...newQuestions];
          });
        }
      }
    } catch (error) {
      console.error('Auto format error:', error);
    }
  }, [getEntry, getBlocksByDate, formatEntry, dayBoundaryHour]);

  /**
   * 時刻質問への回答
   */
  const handleTimeAnswer = useCallback(async (blockId: string, timeframe: Timeframe) => {
    const time = getTimeFromTimeframe(timeframe);
    const newOccurredAt = createOccurredAt(selectedDate, time, dayBoundaryHour);
    
    const updated = await updateBlock(blockId, { occurred_at: newOccurredAt });
    
    if (updated) {
      setBlocks(prev => sortBlocksDesc(
        prev.map(b => b.id === blockId ? { ...b, occurred_at: newOccurredAt } : b)
      ));
      setPendingQuestions(prev => prev.filter(q => q.block_id !== blockId));
      triggerAutoFormat(selectedDate);
    }
  }, [selectedDate, updateBlock, triggerAutoFormat, dayBoundaryHour]);

  const handleExactTimeAnswer = useCallback(async (blockId: string, time: string) => {
    const newOccurredAt = createOccurredAt(selectedDate, time, dayBoundaryHour);

    const updated = await updateBlock(blockId, { occurred_at: newOccurredAt });

    if (updated) {
      setBlocks(prev => sortBlocksDesc(
        prev.map(b => b.id === blockId ? { ...b, occurred_at: newOccurredAt } : b)
      ));
      setPendingQuestions(prev => prev.filter(q => q.block_id !== blockId));
      triggerAutoFormat(selectedDate);
    }
  }, [selectedDate, updateBlock, triggerAutoFormat, dayBoundaryHour]);

  /**
   * 時刻質問を無視
   */
  const handleTimeDismiss = useCallback((blockId: string) => {
    setPendingQuestions(prev => prev.filter(q => q.block_id !== blockId));
  }, []);

  const handlePrevDay = useCallback(() => {
    const prevDate = subDays(new Date(selectedDate), 1);
    onDateChange(format(prevDate, 'yyyy-MM-dd'));
  }, [onDateChange, selectedDate]);

  const handleNextDay = useCallback(() => {
    const nextDate = addDays(new Date(selectedDate), 1);
    if (!isFuture(nextDate) || isTodayFn(nextDate)) {
      onDateChange(format(nextDate, 'yyyy-MM-dd'));
    }
  }, [onDateChange, selectedDate]);

  const handleDateSwipeStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, [role="button"], [data-no-date-swipe="true"]')) {
      dateSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    dateSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [isMobile]);

  const handleDateSwipeEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || !dateSwipeStartRef.current) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - dateSwipeStartRef.current.x;
    const deltaY = Math.abs(touch.clientY - dateSwipeStartRef.current.y);
    dateSwipeStartRef.current = null;

    if (Math.abs(deltaX) < 70 || deltaY > 80) return;

    if (deltaX < 0) {
      handleNextDay();
      return;
    }

    handlePrevDay();
  }, [handleNextDay, handlePrevDay, isMobile]);

  /**
   * ブロック追加
   */
  const handleAddBlock = async (
    content: string, 
    mode: AddBlockMode, 
    images: string[] = [], 
    category: BlockCategory = 'event', 
    tag: BlockTag | null = null,
    scheduleData?: {
      starts_at: string | null;
      ends_at: string | null;
      is_all_day: boolean;
    },
    priority: number = 0,
    batchMode: boolean = false,
    dueData?: {
      due_at: string | null;
      due_all_day: boolean;
    }
  ): Promise<boolean> => {
    // 一括登録モード
    if (batchMode && category === 'task') {
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return false;

      let successCount = 0;

      for (const line of lines) {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticBlock: Block = {
          id: tempId,
          entry_id: entry?.id || '',
          user_id: '',
          content: line,
          images: [],
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          category: 'task',
          tag,
          is_done: false,
          done_at: null,
          url_metadata: null,
          starts_at: null,
          ends_at: null,
          is_all_day: false,
          priority,
          extracted_text: null,
          due_at: null,
          due_all_day: false,
        };
        setBlocks(prev => [optimisticBlock, ...prev]);

        const { block: savedBlock } = await addBlockWithDate({
          content: line,
          selectedDate,
          mode,
          images: [],
          category: 'task',
          tag,
          priority,
          due_at: dueData?.due_at,
          due_all_day: dueData?.due_all_day,
          dayBoundaryHour,
        });

        if (savedBlock) {
          setBlocks(prev => sortBlocksDesc(prev.map(b => b.id === tempId ? savedBlock : b)));
          successCount += 1;
        } else {
          setBlocks(prev => prev.filter(b => b.id !== tempId));
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount}件のタスクを登録しました`);
      }
      return successCount === lines.length;
    }
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
      tag,
      is_done: false,
      done_at: null,
      url_metadata: null,
      starts_at: scheduleData?.starts_at || null,
      ends_at: scheduleData?.ends_at || null,
      is_all_day: scheduleData?.is_all_day || false,
      priority: 0,
      extracted_text: null,
      due_at: null,
      due_all_day: false,
    };
    
    if (mode !== 'toNow' || isToday) {
      setBlocks(prev => [optimisticBlock, ...prev]);
    }
    
    const { block: savedBlock, navigateToDate } = await addBlockWithDate({
      content,
      selectedDate,
      mode,
      images,
      category,
      tag,
      starts_at: scheduleData?.starts_at,
      ends_at: scheduleData?.ends_at,
      is_all_day: scheduleData?.is_all_day,
      priority: category === 'task' ? priority : 0,
      due_at: dueData?.due_at,
      due_all_day: dueData?.due_all_day,
      dayBoundaryHour,
    });
    
    if (savedBlock) {
      if (navigateToDate) {
        onNavigateToDate?.(navigateToDate);
        toast.success(`今日（${formatDisplayDateJST(new Date().toISOString(), dayBoundaryHour)}）に追加しました`);
      } else {
        setBlocks(prev => sortBlocksDesc(prev.map(b => b.id === tempId ? savedBlock : b)));
      }

      // 「あとで」カテゴリでURLが含まれている場合は自動サマライズ
      if (category === 'read_later') {
        const url = extractFirstUrl(content);
        if (url) {
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
      return true;
    } else {
      setBlocks(prev => prev.filter(b => b.id !== tempId));
      return false;
    }
  };

  /**
   * ブロック削除
   */
  const handleDeleteBlock = async (blockId: string) => {
    const blockToDelete = blocks.find(b => b.id === blockId);
    const wasEvent = blockToDelete?.category === 'event';
    
    const success = await deleteBlock(blockId);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
      setPendingQuestions(prev => prev.filter(q => q.block_id !== blockId));
      
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
    
    const updated = await updateBlock(blockId, updates, dayBoundaryHour);
    
    if (!updated) {
      setBlocks(originalBlocks);
    } else if (updates.occurred_at) {
      const newDayKey = getOccurredAtDayKey(updates.occurred_at, dayBoundaryHour);
      if (newDayKey !== selectedDate) {
        setBlocks(prev => prev.filter(b => b.id !== blockId));
        toast.success(`${formatDisplayDateJST(updates.occurred_at, dayBoundaryHour)}に移動しました`);
        
        if (isEvent) {
          triggerAutoFormat(selectedDate);
          triggerAutoFormat(newDayKey);
        }
      } else {
        setBlocks(prev => sortBlocksDesc(prev));
        
        if (isEvent) {
          triggerAutoFormat(selectedDate);
        }
      }
    } else if (isEvent && (updates.content !== undefined)) {
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
      selectedDate,
      dayBoundaryHour
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
      
      if (isEvent) {
        triggerAutoFormat(selectedDate);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" onTouchStart={handleDateSwipeStart} onTouchEnd={handleDateSwipeEnd}>
      <DateNavigation 
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        datesWithEntries={datesWithEntries}
      />

      <FlowInput 
        onSubmit={handleAddBlock}
        selectedDate={selectedDate}
        isToday={isToday}
      />

      {pendingQuestions.length > 0 && (
        <div className="space-y-2">
          {pendingQuestions.map(q => (
            <TimeQuestion
              key={q.block_id}
              blockId={q.block_id}
              contentPreview={q.content_preview}
              question={q.question}
              onAnswer={handleTimeAnswer}
              onAnswerExactTime={handleExactTimeAnswer}
              onDismiss={handleTimeDismiss}
            />
          ))}
        </div>
      )}
      
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
        selectedDate={selectedDate}
        highlightQuery={searchQuery}
        dayBoundaryHour={dayBoundaryHour}
      />
    </div>
  );
}
