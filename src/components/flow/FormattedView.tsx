import { useMemo, useState, type ReactNode } from 'react';
import { Entry, Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { parseTimestamp, formatTimeWithDayBoundary } from '@/lib/dateUtils';
import { useDayBoundary } from '@/contexts/DayBoundaryContext';
import { CATEGORY_CONFIG, BlockCategory } from '@/lib/categoryUtils';
import { BookOpen, ListTodo, Bookmark } from 'lucide-react';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import { parseDiarySections } from '@/lib/diaryParser';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

interface FormattedViewProps {
  entry: Entry | null;
  blocks: Block[];
  onUpdate?: (blockId: string, updates: BlockUpdatePayload) => void;
}

type StockViewMode = 'journal' | 'tasks' | 'readLater';

const PHOTO_MARKER_PATTERN = /\{\{PHOTO:(https?:\/\/[^}\s]+|[a-zA-Z0-9-]+:\d+)\}\}/g;

function resolvePhotoMarker(value: string, blocksById: Map<string, Block>): string[] | null {
  if (/^https?:\/\//.test(value)) return [value];
  const legacyMatch = value.match(/^([a-zA-Z0-9-]+):(\d+)$/);
  if (!legacyMatch) return null;
  const block = blocksById.get(legacyMatch[1]);
  return block?.images && block.images.length > 0 ? block.images : null;
}

function normalizePhotoMarkerPunctuation(text: string): string {
  const marker = String.raw`\{\{PHOTO:(?:https?:\/\/[^}\s]+|[a-zA-Z0-9-]+:\d+)\}\}`;
  const markerGroup = String.raw`((?:${marker}\n\n)+)`;
  return text.replace(new RegExp(`([^\\n])\\n\\n${markerGroup}([。！？!?])(?=\\s|$)`, 'g'), '$1$3\n\n$2');
}

function PhotoMarker({ images }: { images: string[] }) {
  if (!images.length) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={`my-3 inline-grid max-w-full gap-2 rounded-lg bg-transparent p-0.5 transition-opacity hover:opacity-95 ${
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
          aria-label="写真を拡大表示"
        >
          {images.map((url, i) => (
            <span key={url} className="block overflow-hidden rounded-lg bg-background ring-1 ring-border/60">
              <img
                src={url}
                alt={`写真 ${i + 1}`}
                loading="lazy"
                decoding="async"
                className={images.length === 1 ? 'max-h-80 w-full max-w-md object-cover' : 'h-32 w-32 object-cover sm:h-40 sm:w-40'}
              />
            </span>
          ))}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-4">
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((url, i) => (
            <img key={url} src={url} alt={`写真 ${i + 1}`} decoding="async" className="w-full rounded-lg object-contain max-h-[70vh]" />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderContentWithPhotoMarkers(text: string, blocksById: Map<string, Block>) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  PHOTO_MARKER_PATTERN.lastIndex = 0;
  while ((match = PHOTO_MARKER_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }

    const images = resolvePhotoMarker(match[1], blocksById);
    if (images?.length) {
      parts.push(<PhotoMarker key={`photo-${match.index}`} images={images} />);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key="text-end">{text.substring(lastIndex)}</span>);
  }

  return parts.length ? parts : text;
}

export function FormattedView({ entry, blocks, onUpdate }: FormattedViewProps) {
  const { dayBoundaryHour } = useDayBoundary();
  const [viewMode, setViewMode] = useState<StockViewMode>('journal');

  // カテゴリでフィルタ + ソート
  const filteredBlocks = useMemo(() => {
    let filtered: Block[];
    switch (viewMode) {
      case 'journal':
        filtered = blocks.filter(b => b.category === 'event' || b.category === 'thought');
        break;
      case 'tasks':
        filtered = blocks.filter(b => b.category === 'task');
        break;
      case 'readLater':
        filtered = blocks.filter(b => b.category === 'read_later');
        break;
      default:
        filtered = [];
    }
    
    // ストックは昇順（古→新）
    const sorted = [...filtered].sort((a, b) => 
      parseTimestamp(a.occurred_at).getTime() - parseTimestamp(b.occurred_at).getTime()
    );
    
    // タスクの場合は未完了→完了の順
    if (viewMode === 'tasks') {
      return sorted.sort((a, b) => {
        if (a.is_done === b.is_done) return 0;
        return a.is_done ? 1 : -1;
      });
    }
    
    return sorted;
  }, [blocks, viewMode]);

  // AI整形版のセクション分割
  const sections = useMemo(() => {
    return parseDiarySections(normalizePhotoMarkerPunctuation(entry?.formatted_content || ''));
  }, [entry?.formatted_content]);

  const blocksById = useMemo(() => {
    const map = new Map<string, Block>();
    blocks.forEach((block) => map.set(block.id, block));
    return map;
  }, [blocks]);

  const handleTaskToggle = (block: Block) => {
    if (!onUpdate || block.category !== 'task') return;
    
    const newIsDone = !block.is_done;
    onUpdate(block.id, { 
      is_done: newIsDone,
      done_at: newIsDone ? new Date().toISOString() : null,
    });
  };

  const tabClass = (mode: StockViewMode) => 
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      viewMode === mode 
        ? 'bg-primary text-primary-foreground' 
        : 'text-muted-foreground hover:bg-muted'
    }`;

  const renderEmptyState = () => {
    const messages: Record<StockViewMode, { icon: React.ReactNode; title: string; desc: string }> = {
      journal: {
        icon: <BookOpen className="w-8 h-8 text-muted-foreground" />,
        title: '日記がありません',
        desc: '出来事や思ったことを記録すると、ここに表示されます',
      },
      tasks: {
        icon: <ListTodo className="w-8 h-8 text-muted-foreground" />,
        title: 'タスクがありません',
        desc: 'タスクカテゴリで記録すると、ここに表示されます',
      },
      readLater: {
        icon: <Bookmark className="w-8 h-8 text-muted-foreground" />,
        title: 'まだ何もありません',
        desc: '「あとで」カテゴリで記録すると、ここに表示されます',
      },
    };
    const msg = messages[viewMode];
    
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          {msg.icon}
        </div>
        <p className="text-muted-foreground">{msg.title}</p>
        <p className="text-sm text-muted-foreground/70 mt-1">{msg.desc}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* タブ切り替え */}
      <div className="flex gap-2 border-b border-border pb-3">
        <button onClick={() => setViewMode('journal')} className={tabClass('journal')}>
          <BookOpen className="h-4 w-4" />
          日記
        </button>
        <button onClick={() => setViewMode('tasks')} className={tabClass('tasks')}>
          <ListTodo className="h-4 w-4" />
          タスク
        </button>
        <button onClick={() => setViewMode('readLater')} className={tabClass('readLater')}>
          <Bookmark className="h-4 w-4" />
          あとで
        </button>
      </div>

      {/* フィルタ済みブロック */}
      {filteredBlocks.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="space-y-4">
          {filteredBlocks.map((block) => {
            const config = CATEGORY_CONFIG[block.category as BlockCategory];
            const Icon = config?.icon;
            const isTask = block.category === 'task';
            const hasContent = block.content && block.content.trim().length > 0;
            const hasImages = block.images && block.images.length > 0;
            
            return (
              <div key={block.id} className="block-card p-4">
                <div className="flex items-start gap-3">
                  {/* タスクチェックボックス */}
                  {isTask && (
                    <div className="mt-0.5 flex-shrink-0">
                      <TaskCheckbox
                        checked={block.is_done}
                        onToggle={() => handleTaskToggle(block)}
                      />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    {hasContent && (
                      <p className={`text-foreground leading-relaxed whitespace-pre-wrap ${
                        block.is_done ? 'line-through text-muted-foreground' : ''
                      }`}>
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
                            loading="lazy"
                            decoding="async"
                            className="w-full aspect-square object-cover rounded-md border border-border"
                          />
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config?.bgColor} ${config?.color}`}>
                        {Icon && <Icon className="h-3 w-3" />}
                        {config?.label}
                      </span>
                      <span className="timestamp-badge">
                        {formatTimeWithDayBoundary(block.occurred_at, dayBoundaryHour)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI整形版（日記ビュー時のみ） */}
      {viewMode === 'journal' && sections.length > 0 && (
        <div className="space-y-6 mt-8 pt-6 border-t border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            ✨ AI整形版
          </h3>
          {sections.map((section, index) => (
            <div key={index} className="block-card p-5">
              <h4 className="text-lg font-medium text-primary mb-3 flex items-center gap-2">
                {section.title === '今日の3行まとめ' && (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                    ✨
                  </span>
                )}
                {section.title === '朝' && '🌅'}
                {section.title === '昼' && '☀️'}
                {section.title === '夕方' && '🌇'}
                {section.title === '夜' && '🌙'}
                {section.title}
              </h4>
              <div className="prose prose-sm max-w-none text-foreground/90">
                {section.body.split('\n').map((line, i) => {
                  const processedLine = line.replace(/^[-*]\s*/, '• ');
                  const hasPhotoMarker = PHOTO_MARKER_PATTERN.test(processedLine);
                  PHOTO_MARKER_PATTERN.lastIndex = 0;

                  return (
                    <p key={i} className="mb-2 last:mb-0 leading-relaxed">
                      {hasPhotoMarker
                        ? renderContentWithPhotoMarkers(processedLine, blocksById)
                        : processedLine}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
