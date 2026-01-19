import { useState, useRef, KeyboardEvent } from 'react';
import { Trash2, Pencil, Check, X, Calendar, Clock, GripVertical, Square, CheckSquare as CheckSquareIcon } from 'lucide-react';
import { Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { formatTimeJST, getOccurredAtDayKey, createOccurredAt, isFutureDate, parseTimestamp } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { BlockCategory, CATEGORIES, CATEGORY_CONFIG } from '@/lib/categoryUtils';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BlockListProps {
  blocks: Block[];
  onDelete?: (blockId: string) => void;
  onUpdate?: (blockId: string, updates: BlockUpdatePayload) => void;
  onDragEnd?: (activeId: string, overId: string) => void;
  showDelete?: boolean;
  editable?: boolean;
  selectedDate?: string;
}

// カテゴリバッジコンポーネント
function CategoryBadge({ 
  category, 
  editable,
  onCategoryChange 
}: { 
  category: BlockCategory; 
  editable: boolean;
  onCategoryChange?: (cat: BlockCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  if (!editable) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${config.bgColor} ${config.color}`}>
          <Icon className="h-3 w-3" />
          {config.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 bg-popover" align="start">
        <div className="flex flex-col gap-1">
          {CATEGORIES.map((cat) => {
            const catConfig = CATEGORY_CONFIG[cat];
            const CatIcon = catConfig.icon;
            return (
              <button
                key={cat}
                onClick={() => {
                  onCategoryChange?.(cat);
                  setOpen(false);
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left ${
                  cat === category ? catConfig.bgColor : 'hover:bg-muted'
                } ${catConfig.color}`}
              >
                <CatIcon className="h-4 w-4" />
                {catConfig.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ソート可能なブロックアイテム
function SortableBlockItem({ 
  block, 
  children, 
  editable 
}: { 
  block: Block; 
  children: React.ReactNode; 
  editable: boolean;
}) {
  const isTemporary = block.id.startsWith('temp-');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: block.id,
    disabled: !editable || isTemporary,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {editable && !isTemporary && (
        <button 
          {...attributes} 
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 pr-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      {children}
    </div>
  );
}

export function BlockList({ 
  blocks, 
  onDelete, 
  onUpdate,
  onDragEnd,
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
  const [modalImage, setModalImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { distance: 8 } 
    })
  );

  const handleDragEndInternal = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onDragEnd?.(active.id as string, over.id as string);
  };

  const startEditing = (block: Block) => {
    if (!editable || block.id.startsWith('temp-')) return;
    setEditingId(block.id);
    setEditContent(block.content || '');
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
    if (editingId && onUpdate) {
      onUpdate(editingId, { content: editContent.trim() });
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

  const saveEditingDateTime = (blockId: string) => {
    if (!editDayKey || !editTime || !onUpdate) {
      cancelEditingDateTime();
      return;
    }
    
    const newOccurredAt = createOccurredAt(editDayKey, editTime);
    
    if (isFutureDate(newOccurredAt)) {
      toast.error('未来の日時は指定できません');
      return;
    }
    
    onUpdate(blockId, { occurred_at: newOccurredAt });
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

  const handleCategoryChange = (blockId: string, newCategory: BlockCategory) => {
    if (onUpdate) {
      onUpdate(blockId, { category: newCategory });
    }
  };

  const handleTaskToggle = (block: Block) => {
    if (!onUpdate || block.category !== 'task') return;
    
    const newIsDone = !block.is_done;
    onUpdate(block.id, { 
      is_done: newIsDone,
      done_at: newIsDone ? new Date().toISOString() : null,
    });
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
    <>
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter}
        onDragEnd={handleDragEndInternal}
      >
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 pl-6">
            {blocks.map((block, index) => {
              const isTemporary = block.id.startsWith('temp-');
              const isEditing = editingId === block.id;
              const isEditingDateTime = editingDateTimeId === block.id;
              const hasImages = block.images && block.images.length > 0;
              const hasContent = block.content && block.content.trim().length > 0;
              const isTask = block.category === 'task';

              return (
                <SortableBlockItem key={block.id} block={block} editable={editable}>
                  <div
                    className={`block-card block-card-hover p-4 group animate-block-enter ${isTemporary ? 'opacity-60' : ''}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* タスクチェックボックス */}
                      {isTask && !isEditing && (
                        <button
                          onClick={() => handleTaskToggle(block)}
                          className="mt-0.5 flex-shrink-0"
                          disabled={isTemporary}
                        >
                          {block.is_done ? (
                            <CheckSquareIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400 transition-colors" />
                          )}
                        </button>
                      )}
                      
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
                            {hasContent && (
                              <p 
                                className={`text-foreground leading-relaxed whitespace-pre-wrap ${
                                  block.is_done ? 'line-through text-muted-foreground' : ''
                                } ${editable && !isTemporary ? 'cursor-pointer hover:bg-muted/50 -mx-2 -my-1 px-2 py-1 rounded transition-colors' : ''}`}
                                onClick={() => startEditing(block)}
                              >
                                {block.content}
                              </p>
                            )}

                            {/* 画像表示 */}
                            {hasImages && (
                              <div className={`grid gap-2 ${hasContent ? 'mt-3' : ''} ${block.images!.length === 1 ? 'grid-cols-1 max-w-xs' : block.images!.length === 2 ? 'grid-cols-2 max-w-sm' : 'grid-cols-3 max-w-md'}`}>
                                {block.images!.map((url, i) => (
                                  <img
                                    key={i}
                                    src={url}
                                    alt=""
                                    className="w-full aspect-square object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity border border-border"
                                    onClick={() => setModalImage(url)}
                                  />
                                ))}
                              </div>
                            )}
                            
                            {/* カテゴリバッジ + タイムスタンプ */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <CategoryBadge 
                                category={block.category} 
                                editable={editable && !isTemporary}
                                onCategoryChange={(cat) => handleCategoryChange(block.id, cat)}
                              />
                              
                              {isEditingDateTime ? (
                                <div className="flex items-center gap-2">
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
                                    onClick={() => saveEditingDateTime(block.id)}
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
                                  className="timestamp-badge inline-block hover:bg-muted cursor-pointer transition-colors"
                                  onClick={() => startEditingDateTime(block)}
                                  disabled={!editable || isTemporary}
                                >
                                  {formatTimeJST(block.occurred_at)}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {!isEditing && !isTemporary && !isEditingDateTime && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {editable && onUpdate && hasContent && (
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
                </SortableBlockItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* 画像拡大モーダル */}
      <Dialog open={!!modalImage} onOpenChange={() => setModalImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {modalImage && (
            <img
              src={modalImage}
              alt=""
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
