import { useEffect, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, BookOpen, CalendarDays, ArrowLeft, Trophy, Sunrise, Sun, Sunset, Moon, Sparkles, Copy, Check, Camera } from 'lucide-react';
import { useEntries, Entry, Block } from '@/hooks/useEntries';
import { getTodayKey } from '@/lib/dateUtils';
import { DateSelector } from '@/components/flow/DateSelector';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

interface JournalViewProps {
  entries: Entry[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
  blocks?: Block[]; // blocks for photo display
}

// Structured photo marker pattern: {{PHOTO:block_id:count}}
const PHOTO_MARKER_PATTERN = /\{\{PHOTO:([a-zA-Z0-9-]+):(\d+)\}\}/g;

// PhotoMarker component - displays camera icon that opens photo dialog
interface PhotoMarkerProps {
  images: string[];
}

function PhotoMarker({ images }: PhotoMarkerProps) {
  if (!images || images.length === 0) return null;
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button 
          className="inline-flex items-center gap-0.5 mx-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors cursor-pointer align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <Camera className="h-3.5 w-3.5" />
          {images.length > 1 && (
            <span className="text-xs font-medium">{images.length}</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-4">
        <div className={cn(
          "grid gap-2",
          images.length === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`写真 ${i + 1}`}
              className="w-full rounded-lg object-contain max-h-[70vh]"
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to render text with structured photo markers replaced by PhotoMarker components
function renderContentWithPhotoMarkers(
  text: string, 
  blocksById: Map<string, Block>
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  // Reset regex state
  PHOTO_MARKER_PATTERN.lastIndex = 0;
  
  while ((match = PHOTO_MARKER_PATTERN.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }
    
    // Get block by ID from the marker
    const blockId = match[1];
    const block = blocksById.get(blockId);
    
    if (block?.images && block.images.length > 0) {
      parts.push(<PhotoMarker key={`photo-${blockId}`} images={block.images} />);
    }
    // If block not found, just skip the marker (don't show anything)
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key="text-end">{text.substring(lastIndex)}</span>);
  }
  
  return parts.length > 0 ? parts : [<span key="full">{text}</span>];
}

export function JournalView({ entries, selectedDate, onDateSelect, blocks: externalBlocks = [] }: JournalViewProps) {
  const { getEntry, getBlocksByDate } = useEntries();
  
  const [entry, setEntry] = useState<Entry | null>(null);
  const [journalBlocks, setJournalBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const today = getTodayKey();
  const isToday = selectedDate === today;
  
  // モバイルでは今日の場合はデフォルトでコンテンツを表示
  const [showContent, setShowContent] = useState(isToday);
  
  // Score animation state
  const [displayScore, setDisplayScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const scoreAnimationRef = useRef<NodeJS.Timeout | null>(null);

  // Handle mobile date selection
  const handleMobileDateSelect = (date: string) => {
    onDateSelect(date);
    if (isMobile) {
      setShowContent(true);
    }
  };

  // Handle back to date selection (mobile)
  const handleBackToDateSelection = () => {
    setShowContent(false);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setDisplayScore(0);
    try {
      const [entryData, blocksData] = await Promise.all([
        getEntry(selectedDate),
        getBlocksByDate(selectedDate)
      ]);
      setEntry(entryData);
      setJournalBlocks(blocksData);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, getEntry, getBlocksByDate]);
  
  // Use external blocks if provided, otherwise use internally fetched blocks
  const blocks = externalBlocks.length > 0 ? externalBlocks : journalBlocks;

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Score count-up animation
  useEffect(() => {
    if (entry?.score !== null && entry?.score !== undefined && !loading) {
      const target = entry.score;
      const duration = 1000;
      const steps = 30;
      const increment = target / steps;
      const stepTime = duration / steps;
      let current = 0;
      
      if (scoreAnimationRef.current) {
        clearInterval(scoreAnimationRef.current);
      }
      
      scoreAnimationRef.current = setInterval(() => {
        current = Math.min(current + increment, target);
        setDisplayScore(Math.round(current));
        if (current >= target) {
          if (scoreAnimationRef.current) clearInterval(scoreAnimationRef.current);
        }
      }, stepTime);
      
      return () => {
        if (scoreAnimationRef.current) clearInterval(scoreAnimationRef.current);
      };
    }
  }, [entry?.score, loading]);

  // AI formatted content sections
  const sections = useMemo(() => {
    const content = entry?.formatted_content;
    if (!content) return [];

    const parts = content.split(/(?=^## )/m);
    return parts.filter(p => p.trim()).map(section => {
      const lines = section.trim().split('\n');
      const title = lines[0]?.replace(/^##\s*/, '').trim() || '';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    });
  }, [entry?.formatted_content]);

  const formattedDate = format(new Date(selectedDate), 'M月d日（E）', { locale: ja });

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!entry?.formatted_content) return;
    
    try {
      await navigator.clipboard.writeText(entry.formatted_content);
      setCopied(true);
      toast.success('クリップボードにコピーしました');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('コピーに失敗しました');
    }
  }, [entry?.formatted_content]);

  // Score color helper
  const getScoreStyle = (score: number) => {
    if (score === 100) return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', label: 'パーフェクト！', glow: true };
    if (score >= 90) return { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', label: '', glow: true };
    if (score >= 80) return { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', label: '', glow: false };
    if (score >= 60) return { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', label: '', glow: false };
    return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: '', glow: false };
  };

  // Section icon helper
  const getSectionIcon = (title: string) => {
    switch (title) {
      case '朝': return <Sunrise className="h-5 w-5 text-orange-400" />;
      case '昼': return <Sun className="h-5 w-5 text-yellow-500" />;
      case '夕方': return <Sunset className="h-5 w-5 text-orange-500" />;
      case '夜': return <Moon className="h-5 w-5 text-indigo-400" />;
      case '今日の3行まとめ': return <Sparkles className="h-5 w-5 text-blue-500" />;
      default: return null;
    }
  };

  // Date Header component with score
  const DateHeader = () => {
    const hasScore = entry?.score !== null && entry?.score !== undefined;
    const scoreStyle = hasScore ? getScoreStyle(entry!.score!) : null;
    const isPerfect = entry?.score === 100;
    const isHighScore = (entry?.score || 0) >= 90;

    return (
      <div className="flex items-center gap-4 p-5 rounded-xl bg-card border border-border">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500">
          <BookOpen className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-semibold text-foreground truncate">
            {isToday ? '今日の日記' : `${formattedDate}の日記`}
          </h2>
        </div>
        
        {/* Copy Button */}
        {entry?.formatted_content && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
        
        {/* Score Badge with Animation */}
        {hasScore && scoreStyle && (
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm hover:opacity-80 transition-all cursor-pointer",
                  scoreStyle.bg,
                  scoreStyle.text,
                  isPerfect && "animate-bounce",
                  isHighScore && scoreStyle.glow && "shadow-lg"
                )}
              >
                {/* Glow effect for high scores */}
                {isHighScore && scoreStyle.glow && (
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400/30 via-emerald-300/30 to-green-400/30 blur-sm animate-pulse -z-10" />
                )}
                <Trophy className={cn("h-4 w-4", isPerfect && "animate-pulse")} />
                <span className="tabular-nums">{displayScore}点</span>
                {scoreStyle.label && <span className="text-xs font-medium ml-1">{scoreStyle.label}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className={`h-5 w-5 ${scoreStyle.text}`} />
                  <span className="font-semibold">今日のスコア: {entry!.score}点</span>
                </div>
                {entry?.score_details && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {entry.score_details}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  // Create a Map of blocks by ID for efficient lookup in photo markers
  const blocksById = useMemo(() => {
    const map = new Map<string, Block>();
    blocks.forEach(b => map.set(b.id, b));
    return map;
  }, [blocks]);

  // Journal Content component - プレーンなデザイン
  const JournalContent = () => {
    return (
      <>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : !entry?.formatted_content ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
              <BookOpen className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-muted-foreground">日記がまだ生成されていません</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Flowで出来事を記録すると、自動的に日記が生成されます
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => (
              <div 
                key={index} 
                className="p-5 rounded-xl bg-card border border-border"
              >
                <h4 className="text-lg font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted">
                    {getSectionIcon(section.title)}
                  </span>
                  {section.title}
                </h4>
                <div className="prose prose-sm max-w-none text-foreground/90">
                  {section.body.split('\n').map((line, i) => {
                    const processedLine = line.replace(/^[-*]\s*/, '• ');
                    const hasPhotoMarker = PHOTO_MARKER_PATTERN.test(processedLine);
                    PHOTO_MARKER_PATTERN.lastIndex = 0; // Reset regex
                    
                    return (
                      <p key={i} className="mb-2 last:mb-0 leading-relaxed">
                        {hasPhotoMarker 
                          ? renderContentWithPhotoMarkers(processedLine, blocksById)
                          : processedLine
                        }
                      </p>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // Mobile: Step-based UI
  if (isMobile) {
    return showContent ? (
      <div className="space-y-4">
        {/* Back button */}
        <button 
          onClick={handleBackToDateSelection}
          className="flex items-center gap-2 text-blue-500 hover:opacity-80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">日付を選択</span>
        </button>
        
        {/* Date Header and Content */}
        <DateHeader />
        <JournalContent />
      </div>
    ) : (
      <div className="space-y-4">
        {/* Date selection header */}
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">日付を選択してください</span>
        </div>
        
        {/* Date Selector */}
        <DateSelector 
          entries={entries} 
          onSelect={handleMobileDateSelect}
          selectedDate={selectedDate}
        />
      </div>
    );
  }

  // Desktop: Title full-width, then two-column layout
  return (
    <div className="space-y-6">
      {/* Title Card - Full width */}
      <DateHeader />
      
      {/* Two-column layout */}
      <div className="grid md:grid-cols-[240px_1fr] gap-6 w-full overflow-hidden items-start">
        {/* Date List Sidebar */}
        <aside className="rounded-2xl p-4 h-fit bg-card border border-border max-w-[240px] overflow-hidden self-start">
          <div className="sticky top-24">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">日付一覧</span>
            </div>
            <DateSelector 
              entries={entries} 
              onSelect={onDateSelect}
              selectedDate={selectedDate}
            />
          </div>
        </aside>

        {/* Journal Content */}
        <div className="min-w-0 overflow-hidden">
          <JournalContent />
        </div>
      </div>
    </div>
  );
}
