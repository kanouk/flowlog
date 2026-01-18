import { useState, useRef, KeyboardEvent } from 'react';
import { Loader2, Send, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { AddBlockMode } from '@/hooks/useEntries';

interface FlowInputProps {
  onSubmit: (content: string, mode: AddBlockMode) => void;
  disabled?: boolean;
  selectedDate: string;
  isToday: boolean;
}

export function FlowInput({ onSubmit, disabled, selectedDate, isToday }: FlowInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleSubmitWithMode = (mode: AddBlockMode) => {
    if (content.trim() && !disabled) {
      onSubmit(content.trim(), mode);
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // モバイルではEnterで送信しない（改行として動作）
    if (isMobile) return;
    
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmitWithMode('toSelectedDate');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="block-card p-6 relative">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="今、思い出したことを書く…"
        disabled={disabled || isSubmitting}
        className="input-flow w-full min-h-[120px] text-lg leading-relaxed"
        rows={4}
      />
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {isMobile ? '改行可能 • ボタンで保存' : 'Enterで保存 • Shift+Enterで改行'}
        </p>
        <div className="flex items-center gap-2">
          {isSubmitting && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          
          {/* 過去日の場合: 「今で追加」ボタン */}
          {!isToday && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => handleSubmitWithMode('toNow')}
              disabled={!content.trim() || disabled || isSubmitting}
            >
              <Clock className="h-4 w-4 mr-1" />
              今で追加
            </Button>
          )}
          
          {/* 常に表示: メインボタン */}
          <Button 
            size="sm"
            onClick={() => handleSubmitWithMode('toSelectedDate')}
            disabled={!content.trim() || disabled || isSubmitting}
          >
            <Send className="h-4 w-4 mr-1" />
            {isToday ? '保存' : 'この日に追加'}
          </Button>
        </div>
      </div>
    </div>
  );
}
