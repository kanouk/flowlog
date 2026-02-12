import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Loader2, Send, ImagePlus, X, Camera } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { AddBlockMode } from '@/hooks/useEntries';
import { useImageUpload } from '@/hooks/useImageUpload';
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
    priority?: number
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
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [category, setCategory] = useState<BlockCategory>('event');
  const [tag, setTag] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>(0);
  
  // Schedule states
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState('10:00');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const { uploadImages, maxImages } = useImageUpload();
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

  // 30分刻みの時刻を計算するヘルパー関数（切り上げロジック）
  const getRoundedTime = (date: Date): { 
    time: string; 
    endTime: string; 
    startNextDay: boolean;  // 開始日が翌日になるか
    endNextDay: boolean;    // 終了日が翌日になるか（開始日基準）
  } => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // 切り上げロジック: 次の30分枠に進める
    // 00分ちょうど → 00分のまま
    // 01-30分 → 30分に切り上げ
    // 31-59分 → 次の時間の00分に切り上げ
    let roundedHours: number;
    let roundedMinutes: number;
    
    if (minutes === 0) {
      roundedHours = hours;
      roundedMinutes = 0;
    } else if (minutes <= 30) {
      roundedHours = hours;
      roundedMinutes = 30;
    } else {
      roundedHours = hours + 1;
      roundedMinutes = 0;
    }
    
    // 開始日が翌日になるかどうか
    const startNextDay = roundedHours >= 24;
    roundedHours = roundedHours % 24;
    
    // 終了時刻（1時間後）
    const endRoundedHours = (roundedHours + 1) % 24;
    // 終了日が翌日になるか（開始時刻基準で+1時間が24を超える場合）
    const endNextDay = roundedHours + 1 >= 24;
    
    const time = `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    const endTime = `${String(endRoundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    
    return { time, endTime, startNextDay, endNextDay };
  };

  // カテゴリ変更時にスケジュールのデフォルト値を設定
  useEffect(() => {
    if (category === 'schedule' && !startDate) {
      const now = new Date();
      const { time, endTime: calculatedEndTime, startNextDay, endNextDay } = getRoundedTime(now);
      
      // 開始日を設定（切り上げで翌日になる場合は翌日）
      const startDateValue = new Date(now);
      if (startNextDay) {
        startDateValue.setDate(startDateValue.getDate() + 1);
      }
      setStartDate(startDateValue);
      setStartTime(time);
      
      // 終了日を設定（開始日基準で、+1時間が翌日になる場合）
      const endDateValue = new Date(startDateValue);
      if (endNextDay) {
        endDateValue.setDate(endDateValue.getDate() + 1);
      }
      setEndDate(endDateValue);
      setEndTime(calculatedEndTime);
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

  // Build schedule datetime string
  const buildScheduleDateTime = (date: Date | undefined, time: string, allDay: boolean): string | null => {
    if (!date) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (allDay) {
      return `${year}-${month}-${day}T00:00:00.000Z`;
    }
    
    const [hours, minutes] = time.split(':');
    // Create as local time, then convert to ISO
    const localDate = new Date(year, date.getMonth(), date.getDate(), parseInt(hours), parseInt(minutes));
    return localDate.toISOString();
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

      onSubmit(content.trim(), mode, uploadedUrls, category, tag, scheduleData, category === 'task' ? priority : 0);
      
      // リセット
      setContent('');
      // 送信成功時に下書きをクリア
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
      setSelectedImages([]);
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      
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
    console.log('Camera capture triggered', e.target.files);
    handleImageSelect(e);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // クリップボードから画像を貼り付け
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    // 画像がなければ通常のテキスト貼り付けを許可
    if (imageFiles.length === 0) return;

    // 画像がある場合のみデフォルト動作を防ぐ
    e.preventDefault();

    const remaining = maxImages - selectedImages.length;
    if (remaining <= 0) {
      toast.error(`画像は最大${maxImages}枚までです`);
      return;
    }

    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      toast.warning(`最大${maxImages}枚のため、${remaining}枚のみ追加しました`);
    }

    // プレビューURL生成
    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...toAdd]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    
    toast.success(`画像を${toAdd.length}枚追加しました`);
  };

  // 日付フォーマット関数
  const formatDateDisplay = (date: Date | undefined): string => {
    if (!date) return '日付を選択';
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
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

        {/* タスク優先度セレクター */}
        {category === 'task' && (
          <div className="mb-3">
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={disabled || isSubmitting}
            />
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
                    {formatDateDisplay(startDate)}
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
                    {formatDateDisplay(endDate)}
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