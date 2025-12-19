import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Sparkles, Loader2, PenLine, FileText } from 'lucide-react';
import { FlowInput } from '@/components/flow/FlowInput';
import { BlockList } from '@/components/flow/BlockList';
import { FormattedView } from '@/components/flow/FormattedView';
import { useEntries, Block, Entry } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FlowEditorProps {
  date?: string;
}

export function FlowEditor({ date: propDate }: FlowEditorProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const date = propDate || today;
  const isToday = date === today;

  const { 
    formatting, 
    getOrCreateTodayEntry, 
    getBlocks, 
    addBlock, 
    deleteBlock,
    formatEntry,
    getEntry,
  } = useEntries();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('flow');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let entryData: Entry | null = null;
      
      if (isToday) {
        entryData = await getOrCreateTodayEntry();
      } else {
        entryData = await getEntry(date);
      }
      
      setEntry(entryData);
      
      if (entryData) {
        const blocksData = await getBlocks(entryData.id);
        setBlocks(blocksData);
      } else {
        setBlocks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [date, isToday, getOrCreateTodayEntry, getEntry, getBlocks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddBlock = async (content: string) => {
    const newBlock = await addBlock(content);
    if (newBlock) {
      setBlocks(prev => [newBlock, ...prev]);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    const success = await deleteBlock(blockId);
    if (success) {
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    }
  };

  const handleFormat = async () => {
    if (!entry || blocks.length === 0) return;
    
    const result = await formatEntry(entry.id, blocks, date);
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
          {isToday && (
            <FlowInput onSubmit={handleAddBlock} />
          )}
          <BlockList 
            blocks={blocks} 
            onDelete={isToday ? handleDeleteBlock : undefined}
            showDelete={isToday}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-0">
          {entry && <FormattedView entry={entry} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
