import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { ListTodo, CalendarClock, Brain, Bookmark, Loader2, ImagePlus, Camera, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TagDropdown } from '@/components/flow/TagDropdown';
import { PrioritySelector, TaskPriority } from '@/components/flow/PrioritySelector';
import { useCustomTags } from '@/hooks/useCustomTags';
import { useEntries, Block } from '@/hooks/useEntries';
import { useImageUpload } from '@/hooks/useImageUpload';
import { getTodayKey } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { BlockCategory, CATEGORY_CONFIG } from '@/lib/categoryUtils';

type QuickAddCategory = 'event' | 'task' | 'schedule' | 'thought' | 'read_later';

interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: QuickAddCategory;
  onBlockAdded: (block: Block) => void;
}

const MODAL_CONFIG: Record<QuickAddCategory, { title: string; placeholder: string; icon: typeof ListTodo }> = {
  event: {
    title: '出来事を追加',
    placeholder: '今日あった出来事を入力...',
    icon: CalendarClock,
  },
  task: {
    title: 'タスクを追加',
    placeholder: 'タスクの内容を入力...',
    icon: ListTodo,
  },
  schedule: {
    title: '予定を追加',
    placeholder: '予定のタイトルを入力...',
    icon: CalendarClock,
  },
  thought: {
    title: 'メモを追加',
    placeholder: 'メモの内容を入力...',
    icon: Brain,
  },
  read_later: {
    title: 'あとで読むを追加',
    placeholder: 'URLまたはメモを入力...',
    icon: Bookmark,
  },
};

export function QuickAddModal({ open, onOpenChange, category, onBlockAdded }: QuickAddModalProps) {
  const { addBlockWithDate } = useEntries();
  const { customTags, createCustomTag } = useCustomTags();
  const { uploadImages, maxImages } = useImageUpload();
  
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  
  // Image states
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  
  // Schedule states
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState('10:00');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const config = MODAL_CONFIG[category];
  const categoryConfig = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  const getRoundedTime = (date: Date): { 
    time: string; 
    endTime: string; 
    startNextDay: boolean;
    endNextDay: boolean;
  } => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
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
    
    const startNextDay = roundedHours >= 24;
    roundedHours = roundedHours % 24;
    
    const endRoundedHours = (roundedHours + 1) % 24;
    const endNextDay = roundedHours + 1 >= 24;
    
    const time = `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    const calculatedEndTime = `${String(endRoundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    
    return { time, endTime: calculatedEndTime, startNextDay, endNextDay };
  };

  useEffect(() => {
    if (open) {
      setContent('');
      setTag(null);
      setPriority(0);
      setIsAllDay(false);
      setSelectedImages([]);
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      
      if (category === 'schedule') {
        const now = new Date();
        const { time, endTime: calculatedEndTime, startNextDay, endNextDay } = getRoundedTime(now);
        
        const startDateValue = new Date(now);
        if (startNextDay) {
          startDateValue.setDate(startDateValue.getDate() + 1);
        }
        setStartDate(startDateValue);
        setStartTime(time);
        
        const endDateValue = new Date(startDateValue);
        if (endNextDay) {
          endDateValue.setDate(endDateValue.getDate() + 1);
        }
        setEndDate(endDateValue);
        setEndTime(calculatedEndTime);
      } else {
        setStartDate(undefined);
        setEndDate(undefined);
      }
      
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, category]);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const buildScheduleDateTime = (date: Date | undefined, time: string, allDay: boolean): string | null => {
    if (!date) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (allDay) {
      return `${year}-${month}-${day}T00:00:00.000Z`;
    }
    
    const [hours, minutes] = time.split(':');
    const localDate = new Date(year, date.getMonth(), date.getDate(), parseInt(hours), parseInt(minutes));
    return localDate.toISOString();
  };

  const formatDateDisplay = (date: Date | undefined): string => {
    if (!date) return '日付を選択';
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
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

    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...toAdd]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
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

    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...toAdd]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    toast.success(`画像を${toAdd.length}枚追加しました`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const hasContent = content.trim().length > 0;
    const hasImages = selectedImages.length > 0;
    
    if (category === 'schedule' && !startDate) {
      toast.error('開始日を選択してください');
      return;
    }
    
    if (!hasContent && !hasImages && category !== 'schedule') {
      toast.error('内容を入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadedUrls: string[] = [];
      if (hasImages) {
        uploadedUrls = await uploadImages(selectedImages);
        if (uploadedUrls.length !== selectedImages.length) {
          toast.warning('一部の画像のアップロードに失敗しました');
        }
      }

      let scheduleData = undefined;
      if (category === 'schedule') {
        const startsAt = buildScheduleDateTime(startDate, startTime, isAllDay);
        const endsAt = buildScheduleDateTime(endDate, endTime, isAllDay);
        
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

      const { block } = await addBlockWithDate({
        content: content.trim(),
        selectedDate: getTodayKey(),
        mode: 'toNow',
        images: uploadedUrls,
        category,
        tag: tag as import('@/lib/categoryUtils').BlockTag | null,
        starts_at: scheduleData?.starts_at || null,
        ends_at: scheduleData?.ends_at || null,
        is_all_day: scheduleData?.is_all_day || false,
        priority: category === 'task' ? priority : 0,
      });

      if (block) {
        onBlockAdded(block);
        toast.success(`${config.title.replace('を追加', '')}を追加しました`);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${categoryConfig.bgColor}`}>
              <Icon className={`h-5 w-5 ${categoryConfig.color}`} />
            </div>
            {config.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Schedule Input UI */}
          {category === 'schedule' && (
            <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="quick-all-day"
                  checked={isAllDay}
                  onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
                />
                <label htmlFor="quick-all-day" className="text-sm font-medium cursor-pointer">終日</label>
              </div>
              
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
                      const [hours, minutes] = newStartTime.split(':').map(Number);
                      const endHours = (hours + 1) % 24;
                      const newEndTime = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                      setEndTime(newEndTime);
                      if (startDate) {
                        if (hours + 1 >= 24) {
                          const nextDay = new Date(startDate);
                          nextDay.setDate(nextDay.getDate() + 1);
                          setEndDate(nextDay);
                        } else {
                          setEndDate(startDate);
                        }
                      }
                    }}
                    className="h-8 w-24 text-sm"
                  />
                )}
              </div>
              
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
                    className="h-8 w-24 text-sm"
                  />
                )}
                {endDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => setEndDate(undefined)}
                  >
                    クリア
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* タスク優先度セレクター */}
          {category === 'task' && (
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={isSubmitting}
            />
          )}

          {/* Content Textarea */}
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={config.placeholder}
            className="min-h-[100px] resize-none"
          />

          {/* Image Previews */}
          {previewUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
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

          {/* Tag & Image buttons */}
          <div className="flex items-center gap-2">
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

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageSelect}
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

            <TagDropdown
              value={tag}
              onChange={setTag}
              customTags={customTags}
              onCreateTag={createCustomTag}
            />

            {selectedImages.length > 0 && (
              <span className="text-xs text-muted-foreground">
                画像 {selectedImages.length}/{maxImages}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              キャンセル
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className={categoryConfig.buttonColor}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
