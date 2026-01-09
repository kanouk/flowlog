import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import { Block } from '@/hooks/useEntries';
import { Button } from '@/components/ui/button';

interface BlockListProps {
  blocks: Block[];
  onDelete?: (blockId: string) => void;
  showDelete?: boolean;
}

export function BlockList({ blocks, onDelete, showDelete = true }: BlockListProps) {
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
        return (
        <div
          key={block.id}
          className={`block-card block-card-hover p-4 group animate-block-enter ${isTemporary ? 'opacity-60' : ''}`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {block.content}
              </p>
              <p className="timestamp-badge inline-block mt-2">
                {format(new Date(block.created_at), 'HH:mm', { locale: ja })}
              </p>
            </div>
            {showDelete && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(block.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
