import { useState, useRef, KeyboardEvent } from 'react';
import { Trash2, Pencil, Check, X, Calendar, Clock } from 'lucide-react';
import { Block } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { formatTimeJST, getOccurredAtDayKey, createOccurredAt, isFutureDate, parseTimestamp } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface BlockListProps {
  blocks: Block[];
  onDelete?: (blockId: string) => void;
  onUpdate?: (blockId: string, content: string, newOccurredAt?: string) => void;
  showDelete?: boolean;
  editable?: boolean;
  selectedDate?: string;
}

export function BlockList({ 
  blocks, 
  onDelete, 
  onUpdate,
  showDelete = true,
  editable = true,
  selectedDate,
}: BlockListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [editingDateTimeId, setEditingDateTimeId] = useState<string | null>(null);
  const [editDayKey, setEditDayKey] = useState('');
  const [editTime, setEditTime] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = (block: Block) => {
    if (!editable || block.id.startsWith('temp-')) return;
    setEditingId(block.id);
    setEditContent(block.content);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEditing = () => {
    if (editingId && editContent.trim() && onUpdate) {
      onUpdate(editingId, editContent.trim());
    }
    cancelEditing();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      saveEditing();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const startEditingDateTime = (block: Block) => {
    if (!editable || block.id.startsWith('temp-')) return;
    setEditingDateTimeId(block.id);
    setEditDayKey(getOccurredAtDayKey(block.occurred_at));
    setEditTime(formatTimeJST(block.occurred_at));
  };

  const cancelEditingDateTime = () => {
    setEditingDateTimeId(null);
    setEditDayKey('');
    setEditTime('');
  };

  const saveEditingDateTime = (blockId: string, currentContent: string) => {
    if (!editDayKey || !editTime || !onUpdate) {
      cancelEditingDateTime();
      return;
    }
    
    const newOccurredAt = createOccurredAt(editDayKey, editTime);
    
    if (isFutureDate(newOccurredAt)) {
      toast.error('未来の日時は指定できません');
      return;
    }
    
    onUpdate(blockId, currentContent, newOccurredAt);
    cancelEditingDateTime();
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // 未来日は選択不可
      if (date > new Date()) {
        toast.error('未来の日付は指定できません');
        return;
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      setEditDayKey(`${year}-${month}-${day}`);
    }
  };

  if (blocks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </div>
        <p className="text-muted-foreground">
          まだ何も書かれていません
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          上の入力欄に、思い浮かんだことを書いてみましょう
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const isTemporary = block.id.startsWith('temp-');
        const isEditing = editingId === block.id;
        const isEditingDateTime = editingDateTimeId === block.id;

        return (
          <div
            key={block.id}
            className={`block-card block-card-hover p-4 group animate-block-enter ${isTemporary ? 'opacity-60' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      ref={textareaRef}
                      value={editContent}
                      onChange={(e) => {
                        setEditContent(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onBlur={() => {
                        setTimeout(() => {
                          if (editingId === block.id) {
                            saveEditing();
                          }
                        }, 150);
                      }}
                      className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={1}
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Enter: 保存</span>
                      <span>Esc: キャンセル</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p 
                      className={`text-foreground leading-relaxed whitespace-pre-wrap ${editable && !isTemporary ? 'cursor-pointer hover:bg-muted/50 -mx-2 -my-1 px-2 py-1 rounded transition-colors' : ''}`}
                      onClick={() => startEditing(block)}
                    >
                      {block.content}
                    </p>
                    
                    {/* タイムスタンプ + 日時編集 */}
                    {isEditingDateTime ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              {editDayKey}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={parseTimestamp(`${editDayKey}T00:00:00Z`)}
                              onSelect={handleDateSelect}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="h-7 w-24 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => saveEditingDateTime(block.id, block.content)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={cancelEditingDateTime}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="timestamp-badge inline-block mt-2 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => startEditingDateTime(block)}
                        disabled={!editable || isTemporary}
                      >
                        {formatTimeJST(block.occurred_at)}
                      </button>
                    )}
                  </>
                )}
              </div>
              {!isEditing && !isTemporary && !isEditingDateTime && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editable && onUpdate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => startEditing(block)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {showDelete && onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(block.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              {isEditing && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={saveEditing}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={cancelEditing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
