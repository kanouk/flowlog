import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Loader2, Send, Clock, ImagePlus, X, Camera } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { AddBlockMode } from '@/hooks/useEntries';
import { useImageUpload } from '@/hooks/useImageUpload';
import { toast } from 'sonner';
import { 
  BlockCategory, 
  CATEGORIES, 
  CATEGORY_CONFIG, 
  getLastCategory, 
  setLastCategory 
} from '@/lib/categoryUtils';

interface FlowInputProps {
  onSubmit: (content: string, mode: AddBlockMode, images: string[], category: BlockCategory) => void;
  disabled?: boolean;
  selectedDate: string;
  isToday: boolean;
}

const DRAFT_KEY_PREFIX = 'flowlog_draft_';

export function FlowInput({ onSubmit, disabled, selectedDate, isToday }: FlowInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [category, setCategory] = useState<BlockCategory>('event');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const { uploadImages, maxImages } = useImageUpload();

  // 初回マウント時にlocalStorageからカテゴリを復元
  useEffect(() => {
    setCategory(getLastCategory());
  }, []);

  // 下書きをsessionStorageから復元
  useEffect(() => {
    const draft = sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    if (draft) {
      setContent(draft);
      // textareaの高さを調整
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, 0);
    } else {
      setContent('');
    }
  }, [selectedDate]);

  // 入力内容をsessionStorageに保存
  useEffect(() => {
    if (content) {
      sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${selectedDate}`, content);
    } else {
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    }
  }, [content, selectedDate]);

  const handleCategoryChange = (cat: BlockCategory) => {
    setCategory(cat);
    setLastCategory(cat);
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleSubmitWithMode = async (mode: AddBlockMode) => {
    const hasContent = content.trim().length > 0;
    const hasImages = selectedImages.length > 0;
    
    if (!hasContent && !hasImages) return;
    if (disabled) return;

    setIsSubmitting(true);
    try {
      // 画像をアップロード
      let uploadedUrls: string[] = [];
      if (hasImages) {
        uploadedUrls = await uploadImages(selectedImages);
        if (uploadedUrls.length !== selectedImages.length) {
          // 一部アップロード失敗
          toast.warning('一部の画像のアップロードに失敗しました');
        }
      }

      onSubmit(content.trim(), mode, uploadedUrls, category);
      
      // リセット
      setContent('');
      // 送信成功時に下書きをクリア
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
      setSelectedImages([]);
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enterは常に改行、保存はボタンのみ（モバイルでも分かりやすく）
  const handleKeyDown = (_e: KeyboardEvent<HTMLTextAreaElement>) => {
    // キーボードショートカットでの保存を無効化
    // 保存はボタンのみで行う
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = maxImages - selectedImages.length;
    if (remaining <= 0) {
      toast.error(`画像は最大${maxImages}枚までです`);
      return;
    }

    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`最大${maxImages}枚のため、${remaining}枚のみ追加しました`);
    }

    // プレビューURL生成
    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...toAdd]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);

    // input をリセット（同じファイルを再選択可能に）
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleImageSelect(e);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = (content.trim().length > 0 || selectedImages.length > 0) && !disabled && !isSubmitting;

  return (
    <div className="input-card p-6 pl-8">
      {/* カテゴリ選択チップ */}
      <div className="flex gap-2 mb-4">
        {CATEGORIES.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          const isSelected = category === cat;
          
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isSelected 
                  ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </button>
          );
        })}
      </div>
      
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

      {/* 画像プレビュー */}
      {previewUrls.length > 0 && (
        <div className="flex gap-2 mt-4 flex-wrap">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative w-20 h-20 group">
              <img 
                src={url} 
                alt="" 
                className="w-full h-full object-cover rounded-md border border-border"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          {/* 画像選択ボタン */}
          <label className={`cursor-pointer ${selectedImages.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
              disabled={selectedImages.length >= maxImages || isSubmitting}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              asChild
              disabled={selectedImages.length >= maxImages}
            >
              <span>
                <ImagePlus className="h-4 w-4" />
              </span>
            </Button>
          </label>
          
          {/* カメラ撮影ボタン */}
          <label className={`cursor-pointer ${selectedImages.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCameraCapture}
              disabled={selectedImages.length >= maxImages || isSubmitting}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              asChild
              disabled={selectedImages.length >= maxImages}
            >
              <span>
                <Camera className="h-4 w-4" />
              </span>
            </Button>
          </label>
          {selectedImages.length > 0 && (
            <p className="text-sm text-muted-foreground">
              画像{selectedImages.length}/{maxImages}
            </p>
          )}
        </div>
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
              disabled={!canSubmit}
            >
              <Clock className="h-4 w-4 mr-1" />
              今で追加
            </Button>
          )}
          
          {/* 常に表示: メインボタン */}
          <Button 
            size="sm"
            onClick={() => handleSubmitWithMode('toSelectedDate')}
            disabled={!canSubmit}
          >
            <Send className="h-4 w-4 mr-1" />
            {isToday ? '保存' : 'この日に追加'}
          </Button>
        </div>
      </div>
    </div>
  );
}
