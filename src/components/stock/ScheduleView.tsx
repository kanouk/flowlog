import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, ChevronRight, Plus } from 'lucide-react';
import { useEntries, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { BlockEditModal } from '@/components/flow/BlockEditModal';
import { Button } from '@/components/ui/button';
import { CATEGORY_CONFIG } from '@/lib/categoryUtils';
import { TagFilterDropdown } from './TagFilterDropdown';
import { QuickAddModal } from './QuickAddModal';

// コンテンツから1行目（タイトル）と残り（詳細）を分離
const parseContent = (content: string | null): { title: string; details: string | null } => {
  if (!content) return { title: '', details: null };
  const lines = content.split('\n');
  const title = lines[0] || '';
  const details = lines.length > 1 ? lines.slice(1).join('\n').trim() : null;
  return { title, details };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getScheduleStartDate = (block: Block): Date | null => {
  if (!block.starts_at) return null;
  return new Date(block.starts_at);
};

const getScheduleEndDate = (block: Block): Date | null => {
  if (block.ends_at) return new Date(block.ends_at);
  if (block.starts_at) return new Date(block.starts_at);
  return null;
};

const isScheduleOnToday = (block: Block, today: Date): boolean => {
  const start = getScheduleStartDate(block);
  const end = getScheduleEndDate(block);
  if (!start || !end) return false;

  const todayStart = startOfDay(today);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);

  return start < tomorrowStart && end >= todayStart;
};

const getDaysLabel = (block: Block, today: Date): string | null => {
  const start = getScheduleStartDate(block);
  if (!start) return null;

  const diffDays = Math.round((startOfDay(start).getTime() - startOfDay(today).getTime()) / DAY_MS);
  if (diffDays === 0) return null;
  if (diffDays > 0) return `あと${diffDays}日`;
  return `${Math.abs(diffDays)}日前`;
};

const formatDateWithWeekday = (date: Date) => {
  return `${date.getMonth() + 1}月${date.getDate()}日 (${WEEKDAY_LABELS[date.getDay()]})`;
};

const formatTime = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatScheduleRangeWithWeekday = (
  startsAt: string | null,
  endsAt: string | null,
  isAllDay: boolean,
) => {
  if (!startsAt) return '';

  const start = new Date(startsAt);

  if (isAllDay) {
    if (!endsAt) return formatDateWithWeekday(start);
    const end = new Date(endsAt);
    if (isSameDay(start, end)) return formatDateWithWeekday(start);
    return `${formatDateWithWeekday(start)} ~ ${formatDateWithWeekday(end)}`;
  }

  if (!endsAt) {
    return `${formatDateWithWeekday(start)} ${formatTime(start)}~`;
  }

  const end = new Date(endsAt);
  if (isSameDay(start, end)) {
    return `${formatDateWithWeekday(start)} ${formatTime(start)}~${formatTime(end)}`;
  }

  return `${formatDateWithWeekday(start)} ${formatTime(start)} ~ ${formatDateWithWeekday(end)} ${formatTime(end)}`;
};

export function ScheduleView() {
  const { getBlocksByCategory, updateBlock, deleteBlock } = useEntries();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

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

  // 展開トグル
  const toggleExpand = (blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  // 予定アイテムのレンダリング
  const renderScheduleItem = (block: Block, isPast = false) => {
    const { title, details } = parseContent(block.content);
    const isExpanded = expandedBlocks.has(block.id);
    const hasDetails = !!details;
    const isTodaySchedule = isScheduleOnToday(block, now);
    const daysLabel = getDaysLabel(block, now);

    return (
      <div
        key={block.id}
        className={`block-card p-4 cursor-pointer hover:shadow-md transition-all border ${
          isTodaySchedule
            ? 'border-cyan-300 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-900/20 shadow-sm'
            : 'border-border'
        } ${isPast ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div 
            className={`p-2 rounded-lg ${isTodaySchedule ? 'bg-cyan-200 dark:bg-cyan-900/50 ring-1 ring-cyan-300 dark:ring-cyan-700' : config.bgColor}`}
            onClick={() => setEditingBlock(block)}
          >
            <CalendarClock className={`h-5 w-5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0" onClick={() => setEditingBlock(block)}>
            <div className="flex items-start justify-between gap-3">
              <div className={`text-sm font-medium ${config.color} min-w-0`}>
                {formatScheduleRangeWithWeekday(block.starts_at, block.ends_at, block.is_all_day)}
              </div>
              {(isTodaySchedule || daysLabel) && (
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  {isTodaySchedule && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500 text-white whitespace-nowrap min-w-[4.5rem] text-center">
                      今日
                    </span>
                  )}
                  {daysLabel && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap min-w-[4.5rem] text-center ${
                        isTodaySchedule
                          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {daysLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
            {title && (
              <p className="text-foreground font-medium mt-1">{title}</p>
            )}
          </div>
          {hasDetails && (
            <button
              onClick={(e) => toggleExpand(block.id, e)}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {/* 展開時の詳細 */}
        {hasDetails && isExpanded && (
          <div 
            className="mt-3 pl-12 text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-cyan-200 dark:border-cyan-800 ml-5"
            onClick={() => setEditingBlock(block)}
          >
            {details}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between gap-2">
        <TagFilterDropdown value={filterTag} onChange={setFilterTag} />
        <Button
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="bg-cyan-500 hover:bg-cyan-600 text-white gap-1"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">追加</span>
        </Button>
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
          {futureBlocks.map(block => renderScheduleItem(block))}
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
              {pastBlocks.map(block => renderScheduleItem(block, true))}
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

      {/* 追加モーダル */}
      <QuickAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        category="schedule"
        onBlockAdded={(block) => {
          setBlocks(prev => {
            const updated = [...prev, block];
            return updated.sort((a, b) => {
              const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
              const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
              return aTime - bTime;
            });
          });
        }}
      />
    </div>
  );
}
