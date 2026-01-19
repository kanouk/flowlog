import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Sparkles, Loader2, PenLine, FileText, CalendarDays, Sun } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { FormattedView } from '@/components/flow/FormattedView';
import { useEntries, Block, Entry, AddBlockMode, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getTodayKey, parseTimestamp, getOccurredAtDayKey, formatDateJST, calculateMiddleOccurredAt } from '@/lib/dateUtils';
import { BlockCategory } from '@/lib/categoryUtils';
import { arrayMove } from '@dnd-kit/sortable';

interface FlowEditorProps {
  date?: string;
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

export function FlowEditor({ date: propDate, onNavigateToDate }: FlowEditorProps) {
  const today = getTodayKey();
  const date = propDate || today;
  const isToday = date === today;

  const { 
    formatting, 
    getBlocksByDate,
    getEntry,
    addBlockWithDate,
    deleteBlock,
    updateBlock,
    formatEntry,
  } = useEntries();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('flow');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // entry は format 用に取得（なければ作らない）
      const entryData = await getEntry(date);
      setEntry(entryData);
      
      // blocks は occurred_at 範囲で取得（降順で返ってくる）
      const blocksData = await getBlocksByDate(date);
      setBlocks(blocksData);
    } finally {
      setLoading(false);
    }
  }, [date, getEntry, getBlocksByDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * ブロック追加（楽観的更新 + 遷移処理 + 画像対応 + カテゴリ対応）
   */
  const handleAddBlock = async (content: string, mode: AddBlockMode, images: string[] = [], category: BlockCategory = 'event') => {
    // 楽観的更新: 仮のブロックを即座にUIに追加
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
    
    // toNowモードでなければローカルに追加（降順ソート）
    if (mode !== 'toNow' || isToday) {
      setBlocks(prev => sortBlocksDesc([...prev, optimisticBlock]));
    }
    
    // バックエンドに非同期で保存
    const { block: savedBlock, navigateToDate } = await addBlockWithDate({
      content,
      selectedDate: date,
      mode,
      images,
      category,
    });
    
    if (savedBlock) {
      if (navigateToDate) {
        // 今日へ遷移 + トースト
        onNavigateToDate?.(navigateToDate);
        toast.success(`今日（${formatDateJST(new Date().toISOString())}）に追加しました`);
      } else {
        // 成功: 仮IDを本物のIDに置換して再ソート
        setBlocks(prev => sortBlocksDesc(prev.map(b => b.id === tempId ? savedBlock : b)));
      }
    } else {
      // 失敗: 仮ブロックを削除してロールバック
      setBlocks(prev => prev.filter(b => b.id !== tempId));
    }
  };

  /**
   * ブロック削除
   */
  const handleDeleteBlock = async (blockId: string) => {
    const success = await deleteBlock(blockId);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    }
  };

  /**
   * ブロック更新（汎用：content, occurred_at, category, is_done, done_at）
   */
  const handleUpdateBlock = async (blockId: string, updates: BlockUpdatePayload) => {
    // 楽観的更新: 即座にUIを更新
    const originalBlocks = [...blocks];
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, ...updates } : b
    ));
    
    // バックエンドに更新
    const updated = await updateBlock(blockId, updates);
    
    if (!updated) {
      // 失敗時はロールバック
      setBlocks(originalBlocks);
    } else if (updates.occurred_at) {
      // occurred_at が変わった場合、dayKey が変わっていたらブロックを除去
      const newDayKey = getOccurredAtDayKey(updates.occurred_at);
      if (newDayKey !== date) {
        setBlocks(prev => prev.filter(b => b.id !== blockId));
        toast.success(`${formatDateJST(updates.occurred_at)}に移動しました`);
      } else {
        // 同じ日内なら再ソート
        setBlocks(prev => sortBlocksDesc(prev));
      }
    }
  };

  /**
   * D&D並び替え（責務集約: 並び替え計算・楽観更新・永続化・失敗ロールバック）
   */
  const handleDragEnd = async (activeId: string, overId: string) => {
    const oldIndex = blocks.findIndex(b => b.id === activeId);
    const newIndex = blocks.findIndex(b => b.id === overId);
    
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    // 楽観的並び替え
    const originalBlocks = [...blocks];
    const newBlocks = arrayMove(blocks, oldIndex, newIndex);
    setBlocks(newBlocks);

    // 前後ブロック取得（降順なので prev が新しい、next が古い）
    const prevBlock = newIndex > 0 ? newBlocks[newIndex - 1] : null;
    const nextBlock = newIndex < newBlocks.length - 1 ? newBlocks[newIndex + 1] : null;

    // 中間時刻計算（日付クランプ付き）
    const result = calculateMiddleOccurredAt(
      prevBlock?.occurred_at || null,
      nextBlock?.occurred_at || null,
      date
    );

    if (result.success === false) {
      toast.error(result.reason);
      setBlocks(originalBlocks);
      return;
    }

    const newOccurredAt = result.occurredAt;

    // 永続化
    const updated = await updateBlock(activeId, { occurred_at: newOccurredAt });
    
    if (!updated) {
      setBlocks(originalBlocks);
    } else {
      // 成功: occurred_at を更新して再ソート
      setBlocks(prev => sortBlocksDesc(
        prev.map(b => b.id === activeId ? { ...b, occurred_at: newOccurredAt } : b)
      ));
    }
  };

  /**
   * エントリ整形
   */
  const handleFormat = async () => {
    if (blocks.length === 0) return;
    
    // entryがなければ作成
    let currentEntry = entry;
    if (!currentEntry) {
      // blocksがあるならentryも存在するはずだが、念のため
      const entryData = await getEntry(date);
      currentEntry = entryData;
      setEntry(entryData);
    }
    
    if (!currentEntry) {
      toast.error('エントリが見つかりません');
      return;
    }
    
    const result = await formatEntry(currentEntry.id, blocks, date);
    if (result) {
      setEntry(prev => prev ? {
        ...prev,
        formatted_content: result.formatted_content,
        summary: result.summary,
      } : null);
      setActiveTab('stock');
    }
  };

  const formattedDate = format(new Date(date), 'M月d日（E）', { locale: ja });

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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="flow" className="gap-2">
            <PenLine className="h-4 w-4" />
            フロー
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2">
            <FileText className="h-4 w-4" />
            ストック
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="space-y-6 mt-0">
          {/* 全日付で入力フォーム表示 */}
          <FlowInput 
            onSubmit={handleAddBlock}
            selectedDate={date}
            isToday={isToday}
          />
          
          {/* セクションヘッダー + 整形ボタン */}
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
            
            {blocks.length > 0 && (
              <Button
                onClick={handleFormat}
                disabled={formatting}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {formatting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    整形中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    整形する
                  </>
                )}
              </Button>
            )}
          </div>
          
          <BlockList 
            blocks={blocks} 
            onDelete={handleDeleteBlock}
            onUpdate={handleUpdateBlock}
            onDragEnd={handleDragEnd}
            showDelete={true}
            editable={true}
            selectedDate={date}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-0">
          <FormattedView entry={entry} blocks={blocks} onUpdate={handleUpdateBlock} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
