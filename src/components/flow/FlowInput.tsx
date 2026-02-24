import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Loader2, Send, ImagePlus, X, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { AddBlockMode } from '@/hooks/useEntries';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useImageAttachments } from '@/hooks/useImageAttachments';
import { useCustomTags } from '@/hooks/useCustomTags';
import { toast } from 'sonner';
import { TagDropdown } from './TagDropdown';
import { PrioritySelector, TaskPriority } from './PrioritySelector';
import { 
  BlockCategory, 
  CATEGORIES, 
  CATEGORY_CONFIG, 
  getLastCategory, 
  setLastCategory,
  getLastTag,
  setLastTag,
} from '@/lib/categoryUtils';
import {
  buildScheduleDateTime,
  formatScheduleDateDisplay,
  getDefaultScheduleState,
} from '@/lib/entryFormUtils';

interface FlowInputProps {
  onSubmit: (
    content: string, 
    mode: AddBlockMode, 
    images: string[], 
    category: BlockCategory, 
    tag: string | null,
    scheduleData?: {
      starts_at: string | null;
      ends_at: string | null;
      is_all_day: boolean;
    },
    priority?: number,
    batchMode?: boolean
  ) => void;
  disabled?: boolean;
  selectedDate: string;
  isToday: boolean;
}

const DRAFT_KEY_PREFIX = 'flowlog_draft_';

export function FlowInput({ onSubmit, disabled, selectedDate, isToday }: FlowInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [category, setCategory] = useState<BlockCategory>('event');
  const [tag, setTag] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [batchMode, setBatchMode] = useState<boolean>(() => {
    return sessionStorage.getItem('flowlog_batch_mode') === 'true';
  });
  
  // Schedule states
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState('10:00');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { uploadImages, maxImages } = useImageUpload();
  const {
    selectedImages,
    previewUrls,
    handleImageSelect,
    handlePaste,
    removeImage,
    resetImages,
  } = useImageAttachments({ maxImages });
  const { customTags, createCustomTag } = useCustomTags();

  // 初回マウント時にlocalStorageからカテゴリとタグを復元し、フォーカス
  useEffect(() => {
    setCategory(getLastCategory());
    setTag(getLastTag());
    // テキストエリアにフォーカス
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  // 下書きをsessionStorageから復元 + カテゴリ・タグ・優先度をリセット
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

    // 日付移動時にカテゴリ・タグ・優先度をデフォルトにリセット
    setCategory('event');
    setLastCategory('event');
    setTag(null);
    setLastTag(null);
    setPriority(0);
  }, [selectedDate]);

  // 入力内容をsessionStorageに保存
  useEffect(() => {
    if (content) {
      sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${selectedDate}`, content);
    } else {
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    }
  }, [content, selectedDate]);

  // カテゴリ変更時にスケジュールのデフォルト値を設定
  useEffect(() => {
    if (category === 'schedule' && !startDate) {
      const defaults = getDefaultScheduleState();
      setStartDate(defaults.startDate);
      setStartTime(defaults.startTime);
      setEndDate(defaults.endDate);
      setEndTime(defaults.endTime);
    }
  }, [category, startDate]);

  const handleCategoryChange = (cat: BlockCategory) => {
    setCategory(cat);
    setLastCategory(cat);
    // カテゴリ変更時にタグと優先度をクリア
    setTag(null);
    setLastTag(null);
    setPriority(0);
  };

  const handleTagChange = (t: string | null) => {
    setTag(t);
    setLastTag(t);
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
    
    // スケジュールカテゴリの場合、開始日時が必須
    if (category === 'schedule' && !startDate) {
      toast.error('開始日を選択してください');
      return;
    }
    
    if (!hasContent && !hasImages && category !== 'schedule') return;
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

      // スケジュールデータを構築
      let scheduleData = undefined;
      if (category === 'schedule') {
        const startsAt = buildScheduleDateTime(startDate, startTime, isAllDay);
        const endsAt = buildScheduleDateTime(endDate, endTime, isAllDay);
        
        // 終了日時のバリデーション
        if (endsAt && startsAt && new Date(endsAt) < new Date(startsAt)) {
          toast.error('終了日時は開始日時より後にしてください');
          setIsSubmitting(false);
          return;
        }
        
        scheduleData = {
          starts_at: startsAt,
          ends_at: endsAt,
          is_all_day: isAllDay,
        };
      }

      const isBatch = category === 'task' && batchMode && selectedImages.length === 0;
      onSubmit(content.trim(), mode, uploadedUrls, category, tag, scheduleData, category === 'task' ? priority : 0, isBatch);
      
      // リセット
      setContent('');
      // 送信成功時に下書きをクリア
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
      resetImages();
      
      // スケジュール関連もリセット
      if (category === 'schedule') {
        setStartDate(undefined);
        setEndDate(undefined);
        setStartTime('09:00');
        setEndTime('10:00');
        setIsAllDay(false);
      }
      // 優先度リセット
      setPriority(0);
      
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // デスクトップ: Cmd/Ctrl + Enter で保存
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME入力中は無視
    if (isComposing) return;
    
    // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) で送信
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const hasContent = content.trim().length > 0;
      const hasImages = selectedImages.length > 0;
      const canSubmitSchedule = category === 'schedule' && startDate;
      if ((hasContent || hasImages || canSubmitSchedule) && !disabled && !isSubmitting) {
        handleSubmitWithMode('toSelectedDate');
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

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Camera capture triggered', e.target.files);
    handleImageSelect(e);
  };

  const currentConfig = CATEGORY_CONFIG[category];
  const canSubmitSchedule = category === 'schedule' && startDate;
  const canSubmit = (content.trim().length > 0 || selectedImages.length > 0 || canSubmitSchedule) && !disabled && !isSubmitting;

  return (
    <div className={`relative bg-card rounded-2xl overflow-hidden ${!isToday ? 'bg-muted/50' : ''}`}
         style={{ boxShadow: '0 4px 20px -4px rgba(0,0,0,0.1)' }}>
      {/* カテゴリカラーのアクセントストライプ */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${currentConfig.accentColor}`} />
      <div className="p-6 pl-8">
        {/* カテゴリ選択チップ */}
        <div className="flex gap-2 mb-3 flex-wrap">
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

        {/* タスク優先度セレクター + 一括登録トグル */}
        {category === 'task' && (
          <div className="mb-3 flex items-center gap-4 flex-wrap">
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={disabled || isSubmitting}
            />
            <div className="flex items-center gap-1.5">
              <Switch
                id="batch-mode"
                checked={batchMode && selectedImages.length === 0}
                onCheckedChange={(checked) => {
                  setBatchMode(checked);
                  sessionStorage.setItem('flowlog_batch_mode', String(checked));
                }}
                disabled={disabled || isSubmitting || selectedImages.length > 0}
              />
              <label 
                htmlFor="batch-mode" 
                className={`text-sm ${selectedImages.length > 0 ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
              >
                一括登録
              </label>
              {batchMode && selectedImages.length === 0 && (
                <span className="text-xs text-muted-foreground/70">※ 1行1タスクとして登録します</span>
              )}
            </div>
          </div>
        )}

        {/* スケジュール入力UI */}
        {category === 'schedule' && (
          <div className="mb-4 p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800 space-y-3">
            {/* 終日チェックボックス */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="all-day"
                checked={isAllDay}
                onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
              />
              <label htmlFor="all-day" className="text-sm font-medium cursor-pointer">終日</label>
            </div>
            
            {/* 開始日時 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground w-12 flex-shrink-0">開始:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-sm">
                    {formatScheduleDateDisplay(startDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      // 開始日を変更したら終了日も連動
                      if (date) {
                        const [hours] = startTime.split(':').map(Number);
                        if (hours + 1 >= 24) {
                          const nextDay = new Date(date);
                          nextDay.setDate(nextDay.getDate() + 1);
                          setEndDate(nextDay);
                        } else {
                          setEndDate(date);
                        }
                      }
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {!isAllDay && (
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const newStartTime = e.target.value;
                    setStartTime(newStartTime);
                    // 終了時刻を開始時刻の1時間後に自動設定
                    const [hours, minutes] = newStartTime.split(':').map(Number);
                    const endHours = (hours + 1) % 24;
                    const newEndTime = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    setEndTime(newEndTime);
                    // 終了日も設定（常に更新：24時を超えた場合は翌日）
                    if (startDate) {
                      if (hours + 1 >= 24) {
                        const nextDay = new Date(startDate);
                        nextDay.setDate(nextDay.getDate() + 1);
                        setEndDate(nextDay);
                      } else {
                        setEndDate(new Date(startDate));
                      }
                    }
                  }}
                  className="h-8 w-28 text-sm"
                />
              )}
            </div>
            
            {/* 終了日時 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground w-12 flex-shrink-0">終了:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-sm">
                    {formatScheduleDateDisplay(endDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {!isAllDay && (
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-8 w-28 text-sm"
                />
              )}
              {endDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-sm text-muted-foreground"
                  onClick={() => setEndDate(undefined)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}

      
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={category === 'schedule' ? 'スケジュールのメモ（任意）' : '今、思い出したことを書く…'}
        disabled={disabled || isSubmitting}
        className="input-flow w-full min-h-[120px] text-lg leading-relaxed"
        rows={4}
      />

{/* 画像プレビュー */}
      {previewUrls.length > 0 && (
        <div className="flex gap-2 mt-4 flex-wrap">
          {previewUrls.map((url, i) => (
            <div 
              key={url} 
              className="relative w-20 h-20 group animate-thumbnail-enter"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <img 
                src={url} 
                alt="" 
                className="w-full h-full object-cover rounded-md border border-border shadow-sm"
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
            disabled={selectedImages.length >= maxImages || isSubmitting}
          />
          <button 
            type="button"
            disabled={selectedImages.length >= maxImages || isSubmitting}
            onClick={() => fileInputRef.current?.click()}
            className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${selectedImages.length >= maxImages ? 'opacity-50' : ''}`}
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          
          {/* カメラ撮影ボタン */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraCapture}
            disabled={selectedImages.length >= maxImages || isSubmitting}
          />
          <button 
            type="button"
            disabled={selectedImages.length >= maxImages || isSubmitting}
            onClick={() => cameraInputRef.current?.click()}
            className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${selectedImages.length >= maxImages ? 'opacity-50' : ''}`}
          >
            <Camera className="h-4 w-4" />
          </button>
          
          {/* タグドロップダウン */}
          <TagDropdown 
            value={tag} 
            onChange={handleTagChange} 
            customTags={customTags}
            onCreateTag={createCustomTag}
          />
          
          {selectedImages.length > 0 && (
            <p className="text-sm text-muted-foreground">
              画像{selectedImages.length}/{maxImages}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            {isSubmitting && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            
            {/* 常に表示: メインボタン */}
            <Button 
              size="sm"
              onClick={() => handleSubmitWithMode('toSelectedDate')}
              disabled={!canSubmit}
              className={`${currentConfig.buttonColor} disabled:opacity-50`}
            >
              <Send className="h-4 w-4 mr-1" />
              {isToday ? '保存' : 'この日に追加'}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
