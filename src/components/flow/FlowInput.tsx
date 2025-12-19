import { useState, useRef, KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';

interface FlowInputProps {
  onSubmit: (content: string) => Promise<void>;
  disabled?: boolean;
}

export function FlowInput({ onSubmit, disabled }: FlowInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      if (content.trim() && !isSubmitting && !disabled) {
        setIsSubmitting(true);
        try {
          await onSubmit(content.trim());
          setContent('');
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        } finally {
          setIsSubmitting(false);
        }
      }
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
          Enterで保存 • Shift+Enterで改行
        </p>
        {isSubmitting && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>
    </div>
  );
}
