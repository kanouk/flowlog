import { orderTimeline } from '@/lib/blockTiming';
import { useDiaryGeneration } from '@/hooks/useDiaryGeneration';
import { DiaryGenerationState } from '@/components/flow/DiaryGenerationState';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { DateNavigation } from '@/components/flow/DateNavigation';
import { BlockListSkeleton } from '@/components/common/BlockListSkeleton';
import { useDelayedFlag } from '@/components/common/useDelayedFlag';
import { useEntries, Block, Entry, AddBlockMode, BlockUpdatePayload } from '@/hooks/useEntries';
import { toast } from 'sonner';
import { getTodayKey, getOccurredAtDayKey, formatDisplayDateJST, createOccurredAt } from '@/lib/dateUtils';
import { BlockCategory } from '@/lib/categoryUtils';
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
  datesWithPhotos?: string[];
  targetBlockId?: string | null;
  onBlockScrolled?: () => void;
  searchQuery?: string | null;
  onSearchCleared?: () => void;
}

/**
 * ブロックを降順にソート（occurred_at, created_at）
 */
function sortBlocksDesc(blocks: Block[]): Block[] {
  return orderTimeline([...new Map(blocks.map(block => [block.id, block])).values()]).blocks;
}

export function FlowView({ selectedDate, onNavigateToDate, onDateChange, datesWithEntries = [], datesWithPhotos = [], targetBlockId, onBlockScrolled, searchQuery, onSearchCleared }: FlowViewProps) {
  const { dayBoundaryHour } = useDayBoundary();
  const isMobile = useIsMobile();
  const today = getTodayKey(dayBoundaryHour);
  const isToday = selectedDate === today;
  const dateSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadRequestIdRef = useRef(0);
  const savedDuringLoad = useRef<Block[] | null>(null);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  // 現在表示中のデータがどの日付のものか。selectedDate と異なる間は
  // 古い日付のブロックを見せず、スケルトン表示に切り替える
  const loadedDateRef = useRef<string | null>(null);

  const { 
    getBlocksByDate,
    getEntry,
    addBlockWithDate,
    deleteBlock,
    updateBlock,
    setBlockTiming,
    summarizeUrl,
  } = useEntries();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const showInitialSkeleton = useDelayedFlag(initialLoading, 150);

  const loadData = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    savedDuringLoad.current = [];
    const isInitialLoad = loadedDateRef.current !== selectedDate;

    if (isInitialLoad) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [entryData, blocksData] = await Promise.all([
        getEntry(selectedDate),
        getBlocksByDate(selectedDate, dayBoundaryHour),
      ]);
      if (loadRequestIdRef.current !== requestId || selectedDateRef.current !== selectedDate) return;

      setEntry(entryData);
      setBlocks(sortBlocksDesc([...(savedDuringLoad.current || []), ...blocksData]));
    } finally {
      if (loadRequestIdRef.current === requestId && selectedDateRef.current === selectedDate) {
        savedDuringLoad.current = null;
        loadedDateRef.current = selectedDate;
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedDate, getEntry, getBlocksByDate, dayBoundaryHour]);

  useEffect(() => {
    loadData();
  }, [loadData, selectedDate]);

  // 表示中のブロックが selectedDate のものになるまでは古い日付のデータを見せない
  // （ref の更新は selectedDate 変更による再レンダー時に評価される）
  const isDateStale = loadedDateRef.current !== selectedDate;
  const showLoadingState = initialLoading || isDateStale;

  useTargetBlockHighlight({
    targetBlockId,
    enabled: !showLoadingState && blocks.length > 0,
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

  // Mutations enqueue server jobs transactionally. The browser only observes.
  const generation = useDiaryGeneration(selectedDate, () => {void loadData();});

  const applyTiming = async (id: string, answer: Parameters<typeof setBlockTiming>[1]) => {
    const updated = await setBlockTiming(id, answer);
    if (updated) setBlocks(current => sortBlocksDesc(current.map(block => block.id === id ? updated : block)));
    return Boolean(updated);
  };

  const applyExactTime = async (id: string, time: string) => {
    const updated = await updateBlock(id, { occurred_at: createOccurredAt(selectedDate, time, dayBoundaryHour) }, dayBoundaryHour);
    if (updated) setBlocks(current => sortBlocksDesc(current.map(block => block.id === id ? updated : block)));
    return Boolean(updated);
  };

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

  const showSavedBlock = (tempId: string, saved: Block) => {
    if (selectedDateRef.current !== selectedDate) return;
    savedDuringLoad.current?.push(saved);
    setBlocks(current => sortBlocksDesc([...current.filter(block => block.id !== tempId), saved]));
  };

  /**
   * ブロック追加
   */
  const handleAddBlock = async (
    content: string, 
    mode: AddBlockMode, 
    images: string[] = [], 
    category: BlockCategory = 'event', 
    tag: string | null = null,
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
      const confirmations: Array<() => void> = [];
      const batchKey = JSON.stringify({content,selectedDate,mode,tag,priority,dueData});

      for (const [index, line] of lines.entries()) {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticBlock: Block = {
          id: tempId,
          entry_id: entry?.id || '',
          user_id: '',
          content: line,
          images: [],
          occurred_at: new Date().toISOString(),
          time_confirmed_at: null,
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

        const { block: savedBlock, confirm } = await addBlockWithDate({
          batchKey: batchKey+':'+index,
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
          showSavedBlock(tempId, savedBlock);
          successCount += 1;
          if (confirm) confirmations.push(confirm);
        } else {
          setBlocks(prev => prev.filter(b => b.id !== tempId));
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount}件のタスクを登録しました`);
      }
      if (successCount === lines.length) confirmations.forEach(confirm => confirm());
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
      time_confirmed_at: null,
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
        showSavedBlock(tempId, savedBlock);
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
    
    const success = await deleteBlock(blockId);
    if (success) {
      if (savedDuringLoad.current) savedDuringLoad.current = savedDuringLoad.current.filter(block => block.id !== blockId);
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    }
  };

  /**
   * ブロック更新（汎用）
   */
  const handleUpdateBlock = async (blockId: string, updates: BlockUpdatePayload) => {
    const originalBlocks = [...blocks];
    
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
      } else {
        setBlocks(prev => sortBlocksDesc(prev));
      }
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

    const updated = await setBlockTiming(activeId, {
      later: newBlocks[newIndex - 1]?.id ?? null,
      earlier: newBlocks[newIndex + 1]?.id ?? null,
    });
    setBlocks(current => sortBlocksDesc(current.map(block => block.id === activeId ? (updated ?? originalBlocks[oldIndex]) : block)));
  };

  return (
    <div className="space-y-6" onTouchStart={handleDateSwipeStart} onTouchEnd={handleDateSwipeEnd}>
      <DateNavigation
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        datesWithEntries={datesWithEntries}
        datesWithPhotos={datesWithPhotos}
      />

      <FlowInput
        onSubmit={handleAddBlock}
        selectedDate={selectedDate}
        isToday={isToday}
      />

      {showLoadingState ? (
        showInitialSkeleton ? <BlockListSkeleton /> : null
      ) : (
        <>
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

            {refreshing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                更新中...
              </div>
            )}
          </div>

          <DiaryGenerationState status={generation.status} unavailable={generation.unavailable} onRetry={() => {void generation.request();}} />

          <BlockList
            blocks={blocks}
            onDelete={handleDeleteBlock}
            onUpdate={handleUpdateBlock}
            onDragEnd={handleDragEnd}
            onTimingAnswer={applyTiming}
            onExactTime={applyExactTime}
            selectedDate={selectedDate}
            highlightQuery={searchQuery}
            dayBoundaryHour={dayBoundaryHour}
          />
        </>
      )}
    </div>
  );
}
