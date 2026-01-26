import { useState } from 'react';
import { Trash2, Pencil, GripVertical, CalendarClock } from 'lucide-react';
import { icons } from 'lucide-react';
import { Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import { formatTimeJST } from '@/lib/dateUtils';
import { BlockCategory, BlockTag, CATEGORY_CONFIG, TAG_CONFIG, TAGS, formatScheduleRange } from '@/lib/categoryUtils';
import { useCustomTags, TAG_COLORS } from '@/hooks/useCustomTags';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BlockEditModal } from './BlockEditModal';

interface BlockListProps {
  blocks: Block[];
  onDelete?: (blockId: string) => void;
  onUpdate?: (blockId: string, updates: BlockUpdatePayload) => void;
  onDragEnd?: (activeId: string, overId: string) => void;
  showDelete?: boolean;
  editable?: boolean;
  selectedDate?: string;
}

// アイコン名をPascalCaseに変換
function kebabToPascal(str: string): string {
  return str.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

// アイコンコンポーネントを取得
function getIconComponent(iconName: string) {
  const pascalName = kebabToPascal(iconName);
  return (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName];
}

// カテゴリバッジコンポーネント（表示専用）
function CategoryBadge({ category }: { category: BlockCategory }) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// Check if value is a base tag
function isBaseTag(value: string | null): value is BlockTag {
  return value !== null && TAGS.includes(value as BlockTag);
}

// タグバッジコンポーネント（表示専用）- カスタムタグ対応
function TagBadge({ tag, customTags }: { tag: string | null; customTags: ReturnType<typeof useCustomTags>['customTags'] }) {
  if (!tag) return null;

  // Check if it's a base tag
  if (isBaseTag(tag)) {
    const config = TAG_CONFIG[tag];
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
        <Icon className="h-3 w-3" />
      </span>
    );
  }

  // Check if it's a custom tag
  const customTag = customTags.find(t => t.id === tag);
  if (customTag) {
    const colorConfig = TAG_COLORS[customTag.color];
    const IconComponent = getIconComponent(customTag.icon);
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${colorConfig.bg} ${colorConfig.text}`}>
        {IconComponent && <IconComponent className="h-3 w-3" />}
      </span>
    );
  }

  return null;
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
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const { customTags } = useCustomTags();

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

  const handleTaskToggle = (block: Block) => {
    if (!onUpdate || block.category !== 'task') return;
    
    const newIsDone = !block.is_done;
    onUpdate(block.id, { 
      is_done: newIsDone,
      done_at: newIsDone ? new Date().toISOString() : null,
    });
  };

  const handleEditSave = async (updates: BlockUpdatePayload & { images?: string[] }) => {
    if (!editingBlock || !onUpdate) return;
    onUpdate(editingBlock.id, updates);
  };

  const handleEditDelete = () => {
    if (!editingBlock || !onDelete) return;
    onDelete(editingBlock.id);
    setEditingBlock(null);
  };

  const openEditModal = (block: Block) => {
    if (!editable || block.id.startsWith('temp-')) return;
    setEditingBlock(block);
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
              const hasImages = block.images && block.images.length > 0;
              const hasContent = block.content && block.content.trim().length > 0;
              const isTask = block.category === 'task';
              const isSchedule = block.category === 'schedule';

              return (
                <SortableBlockItem key={block.id} block={block} editable={editable}>
                  <div
                    className={`block-card block-card-hover p-4 group animate-block-enter ${isTemporary ? 'opacity-60' : ''}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* タスクチェックボックス */}
                      {isTask && (
                        <div className="mt-0.5 flex-shrink-0">
                          <TaskCheckbox
                            checked={block.is_done}
                            onToggle={() => handleTaskToggle(block)}
                            disabled={isTemporary}
                          />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        {hasContent && (
                          <p 
                            className={`text-foreground leading-relaxed whitespace-pre-wrap break-words break-anywhere ${
                              block.is_done ? 'line-through text-muted-foreground' : ''
                            }`}
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
                        
                        {/* スケジュール日時表示 */}
                        {isSchedule && block.starts_at && (
                          <div className="flex items-center gap-1.5 text-sm text-cyan-600 dark:text-cyan-400 mt-2">
                            <CalendarClock className="h-3.5 w-3.5" />
                            <span>{formatScheduleRange(block.starts_at, block.ends_at, block.is_all_day)}</span>
                          </div>
                        )}
                        
                        {/* カテゴリバッジ + タグバッジ + タイムスタンプ */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <CategoryBadge category={block.category} />
                          <TagBadge tag={block.tag} customTags={customTags} />
                          <span className="timestamp-badge">
                            {formatTimeJST(block.occurred_at)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Action buttons */}
                      {!isTemporary && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {editable && onUpdate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditModal(block)}
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

      {/* 編集モーダル */}
      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          open={!!editingBlock}
          onOpenChange={(open) => !open && setEditingBlock(null)}
          onSave={handleEditSave}
          onDelete={showDelete ? handleEditDelete : undefined}
        />
      )}
    </>
  );
}
