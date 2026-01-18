import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Sparkles, Loader2, PenLine, FileText } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { FormattedView } from '@/components/flow/FormattedView';
import { useEntries, Block, Entry, AddBlockMode } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getTodayKey, parseTimestamp, getOccurredAtDayKey, formatDateJST } from '@/lib/dateUtils';

interface FlowEditorProps {
  date?: string;
  onNavigateToDate?: (date: string) => void;
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
    updateBlockWithOccurredAt,
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
      
      // blocks は occurred_at 範囲で取得
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
   * ブロック追加（楽観的更新 + 遷移処理 + 画像対応）
   */
  const handleAddBlock = async (content: string, mode: AddBlockMode, images: string[] = []) => {
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
    };
    
    // toNowモードでなければローカルに追加
    if (mode !== 'toNow' || isToday) {
      setBlocks(prev => {
        const updated = [...prev, optimisticBlock];
        return updated.sort((a, b) => {
          const occurredDiff = parseTimestamp(a.occurred_at).getTime() - parseTimestamp(b.occurred_at).getTime();
          if (occurredDiff !== 0) return occurredDiff;
          return parseTimestamp(a.created_at).getTime() - parseTimestamp(b.created_at).getTime();
        });
      });
    }
    
    // バックエンドに非同期で保存
    const { block: savedBlock, navigateToDate } = await addBlockWithDate({
      content,
      selectedDate: date,
      mode,
      images,
    });
    
    if (savedBlock) {
      if (navigateToDate) {
        // 今日へ遷移 + トースト
        onNavigateToDate?.(navigateToDate);
        toast.success(`今日（${formatDateJST(new Date().toISOString())}）に追加しました`);
      } else {
        // 成功: 仮IDを本物のIDに置換
        setBlocks(prev => prev.map(b => b.id === tempId ? savedBlock : b));
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
   * ブロック更新（content + occurred_at）
   */
  const handleUpdateBlock = async (blockId: string, content: string, newOccurredAt?: string) => {
    // 楽観的更新: 即座にUIを更新
    const originalBlocks = [...blocks];
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, content, ...(newOccurredAt && { occurred_at: newOccurredAt }) } : b
    ));
    
    // バックエンドに更新
    const updated = await updateBlockWithOccurredAt(blockId, content, newOccurredAt);
    
    if (!updated) {
      // 失敗時はロールバック
      setBlocks(originalBlocks);
    } else if (newOccurredAt) {
      // occurred_at が変わった場合、dayKey が変わっていたらブロックを除去
      const newDayKey = getOccurredAtDayKey(newOccurredAt);
      if (newDayKey !== date) {
        setBlocks(prev => prev.filter(b => b.id !== blockId));
        toast.success(`${formatDateJST(newOccurredAt)}に移動しました`);
      }
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            {isToday ? '今日のログ' : formattedDate}
          </h2>
          {isToday && (
            <p className="text-muted-foreground mt-1">
              {formattedDate}
            </p>
          )}
        </div>
        
        {blocks.length > 0 && (
          <Button
            onClick={handleFormat}
            disabled={formatting}
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
          <BlockList 
            blocks={blocks} 
            onDelete={handleDeleteBlock}
            onUpdate={handleUpdateBlock}
            showDelete={true}
            editable={true}
            selectedDate={date}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-0">
          {entry && <FormattedView entry={entry} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
