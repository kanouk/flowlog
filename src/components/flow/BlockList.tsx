import { useState, useRef, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { Block } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';

interface BlockListProps {
  blocks: Block[];
  onDelete?: (blockId: string) => void;
  onUpdate?: (blockId: string, content: string) => void;
  showDelete?: boolean;
  editable?: boolean;
}

export function BlockList({ 
  blocks, 
  onDelete, 
  onUpdate,
  showDelete = true,
  editable = true,
}: BlockListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isComposing, setIsComposing] = useState(false);
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
                        // 少し遅延させてボタンクリックを処理できるようにする
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
                    <p className="timestamp-badge inline-block mt-2">
                      {format(new Date(block.created_at), 'HH:mm', { locale: ja })}
                    </p>
                  </>
                )}
              </div>
              {!isEditing && !isTemporary && (
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
