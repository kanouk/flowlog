import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Trash2, ImagePlus, Camera, Clock, Calendar } from 'lucide-react';
import { Block, BlockUpdatePayload } from '@/hooks/useEntries';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useCustomTags } from '@/hooks/useCustomTags';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { TagDropdown } from './TagDropdown';
import { toast } from 'sonner';
import { 
  BlockCategory, 
  CATEGORIES, 
  CATEGORY_CONFIG, 
} from '@/lib/categoryUtils';
import { 
  formatTimeJST, 
  getOccurredAtDayKey, 
  createOccurredAt, 
  isFutureDate, 
  parseTimestamp 
} from '@/lib/dateUtils';

// Helper to format time from ISO string
const formatTimeFromISO = (isoString: string | null): string => {
  if (!isoString) return '09:00';
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Helper to build ISO datetime from date and time
const buildScheduleDateTime = (
  date: Date | undefined, 
  time: string, 
  isAllDay: boolean
): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (isAllDay) {
    return `${year}-${month}-${day}T00:00:00+09:00`;
  }
  
  return `${year}-${month}-${day}T${time}:00+09:00`;
};

// Helper to format date display
const formatDateDisplay = (date: Date | undefined): string => {
  if (!date) return '未設定';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

interface BlockEditModalProps {
  block: Block;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: BlockUpdatePayload & { images?: string[] }) => Promise<void>;
  onDelete?: () => void;
}

export function BlockEditModal({ 
  block, 
  open, 
  onOpenChange, 
  onSave, 
  onDelete 
}: BlockEditModalProps) {
  // Content
  const [content, setContent] = useState(block.content || '');
  const [isComposing, setIsComposing] = useState(false);
  
  // Category & Tag
  const [category, setCategory] = useState<BlockCategory>(block.category);
  const [tag, setTag] = useState<string | null>(block.tag);
  
  // Images
  const [existingImages, setExistingImages] = useState<string[]>(block.images || []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  
  // Date/Time for non-schedule
  const [dayKey, setDayKey] = useState(getOccurredAtDayKey(block.occurred_at));
  const [time, setTime] = useState(formatTimeJST(block.occurred_at));
  
  // Schedule-specific states
  const [isAllDay, setIsAllDay] = useState(block.is_all_day || false);
  const [scheduleStartDate, setScheduleStartDate] = useState<Date | undefined>(
    block.starts_at ? new Date(block.starts_at) : undefined
  );
  const [scheduleStartTime, setScheduleStartTime] = useState(
    formatTimeFromISO(block.starts_at)
  );
  const [scheduleEndDate, setScheduleEndDate] = useState<Date | undefined>(
    block.ends_at ? new Date(block.ends_at) : undefined
  );
  const [scheduleEndTime, setScheduleEndTime] = useState(
    formatTimeFromISO(block.ends_at)
  );
  
  // UI State
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { uploadImages, deleteImages, maxImages } = useImageUpload();
  const { customTags, createCustomTag } = useCustomTags();
  
  // Reset state when modal opens with new block
  useEffect(() => {
    if (open) {
      setContent(block.content || '');
      setCategory(block.category);
      setTag(block.tag);
      setExistingImages(block.images || []);
      setNewImages([]);
      setNewImagePreviews([]);
      setDayKey(getOccurredAtDayKey(block.occurred_at));
      setTime(formatTimeJST(block.occurred_at));
      // Schedule states
      setIsAllDay(block.is_all_day || false);
      setScheduleStartDate(block.starts_at ? new Date(block.starts_at) : undefined);
      setScheduleStartTime(formatTimeFromISO(block.starts_at));
      setScheduleEndDate(block.ends_at ? new Date(block.ends_at) : undefined);
      setScheduleEndTime(formatTimeFromISO(block.ends_at));
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [open, block]);
  
  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      newImagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [newImagePreviews]);
  
  // Auto-resize textarea
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [open, content]);
  
  const totalImages = existingImages.length + newImages.length;
  
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };
  
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const remaining = maxImages - totalImages;
    if (remaining <= 0) {
      toast.error(`画像は最大${maxImages}枚までです`);
      return;
    }
    
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`最大${maxImages}枚のため、${remaining}枚のみ追加しました`);
    }
    
    const previews = toAdd.map(f => URL.createObjectURL(f));
    setNewImages(prev => [...prev, ...toAdd]);
    setNewImagePreviews(prev => [...prev, ...previews]);
    
    e.target.value = '';
  };
  
  const removeExistingImage = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };
  
  const removeNewImage = (index: number) => {
    URL.revokeObjectURL(newImagePreviews[index]);
    setNewImages(prev => prev.filter((_, i) => i !== index));
    setNewImagePreviews(prev => prev.filter((_, i) => i !== index));
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

    const remaining = maxImages - totalImages;
    if (remaining <= 0) {
      toast.error(`画像は最大${maxImages}枚までです`);
      return;
    }

    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      toast.warning(`最大${maxImages}枚のため、${remaining}枚のみ追加しました`);
    }

    // プレビューURL生成
    const previews = toAdd.map(f => URL.createObjectURL(f));
    setNewImages(prev => [...prev, ...toAdd]);
    setNewImagePreviews(prev => [...prev, ...previews]);
    
    toast.success(`画像を${toAdd.length}枚追加しました`);
  };
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      if (date > new Date()) {
        toast.error('未来の日付は指定できません');
        return;
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      setDayKey(`${year}-${month}-${day}`);
    }
  };
  
  const setToNow = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setDayKey(`${year}-${month}-${day}`);
    setTime(`${hours}:${minutes}`);
  };
  
  // Schedule handlers
  const handleScheduleStartDateChange = (date: Date | undefined) => {
    setScheduleStartDate(date);
    // Auto-set end date to same day if not set
    if (date && !scheduleEndDate) {
      setScheduleEndDate(date);
      // Auto-set end time to +1 hour
      const [hours, minutes] = scheduleStartTime.split(':').map(Number);
      const endHour = (hours + 1) % 24;
      setScheduleEndTime(`${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    }
  };
  
  const handleScheduleStartTimeChange = (newTime: string) => {
    setScheduleStartTime(newTime);
    // Auto-update end time to +1 hour
    const [hours, minutes] = newTime.split(':').map(Number);
    const endHour = (hours + 1) % 24;
    setScheduleEndTime(`${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  };
  
  const clearScheduleEndDate = () => {
    setScheduleEndDate(undefined);
  };
  
  const handleSave = async () => {
    if (isSaving) return;
    
    const newOccurredAt = createOccurredAt(dayKey, time);
    if (isFutureDate(newOccurredAt)) {
      toast.error('未来の日時は指定できません');
      return;
    }
    
    setIsSaving(true);
    try {
      // 1. Upload new images
      let uploadedUrls: string[] = [];
      if (newImages.length > 0) {
        uploadedUrls = await uploadImages(newImages);
        if (uploadedUrls.length !== newImages.length) {
          toast.warning('一部の画像のアップロードに失敗しました');
        }
      }
      
      // 2. Calculate final image list
      const finalImages = [...existingImages, ...uploadedUrls];
      
      // 3. Delete removed images from storage
      const deletedImages = (block.images || []).filter(url => !existingImages.includes(url));
      if (deletedImages.length > 0) {
        await deleteImages(deletedImages);
      }
      
      // 4. Prepare updates
      const updates: BlockUpdatePayload & { images?: string[] } = {};
      
      if (content !== block.content) {
        updates.content = content;
      }
      if (category !== block.category) {
        updates.category = category;
      }
      if (tag !== block.tag) {
        updates.tag = tag as any;
      }
      if (newOccurredAt !== block.occurred_at) {
        updates.occurred_at = newOccurredAt;
      }
      
      // Schedule fields
      if (category === 'schedule') {
        const startsAt = buildScheduleDateTime(scheduleStartDate, scheduleStartTime, isAllDay);
        const endsAt = buildScheduleDateTime(scheduleEndDate, scheduleEndTime, isAllDay);
        
        if (startsAt !== block.starts_at) updates.starts_at = startsAt;
        if (endsAt !== block.ends_at) updates.ends_at = endsAt;
        if (isAllDay !== block.is_all_day) updates.is_all_day = isAllDay;
      }
      
      // Always update images if there are any changes
      const originalImages = block.images || [];
      const imagesChanged = 
        finalImages.length !== originalImages.length ||
        finalImages.some((url, i) => url !== originalImages[i]);
      
      if (imagesChanged) {
        updates.images = finalImages;
      }
      
      await onSave(updates);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving block:', error);
      toast.error('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (isDeleting || !onDelete) return;
    
    setIsDeleting(true);
    try {
      onDelete();
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const currentConfig = CATEGORY_CONFIG[category];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ログを編集</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {/* Category chips */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const Icon = config.icon;
              const isSelected = category === cat;
              
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isSelected 
                      ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>
          
          
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="内容を入力..."
            className="w-full min-h-[160px] bg-muted/30 border border-input rounded-md px-3 py-3 text-foreground leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          
          {/* Images */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">画像 ({totalImages}/{maxImages})</span>
              <div className="flex gap-1 items-center">
                {/* タグドロップダウン */}
                <TagDropdown 
                  value={tag} 
                  onChange={setTag} 
                  customTags={customTags}
                  onCreateTag={createCustomTag}
                />
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                  disabled={totalImages >= maxImages}
                />
                <button
                  type="button"
                  disabled={totalImages >= maxImages}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${totalImages >= maxImages ? 'opacity-50' : ''}`}
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
                  disabled={totalImages >= maxImages}
                />
                <button
                  type="button"
                  disabled={totalImages >= maxImages}
                  onClick={() => cameraInputRef.current?.click()}
                  className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${totalImages >= maxImages ? 'opacity-50' : ''}`}
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {(existingImages.length > 0 || newImagePreviews.length > 0) && (
              <div className="flex gap-2 flex-wrap">
                {/* Existing images */}
                {existingImages.map((url, i) => (
                  <div key={`existing-${i}`} className="relative w-20 h-20 group">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(i)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {/* New images */}
                {newImagePreviews.map((url, i) => (
                  <div key={`new-${i}`} className="relative w-20 h-20 group">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover rounded-md border border-border ring-2 ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(i)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Schedule category - special date/time UI */}
          {category === 'schedule' && (
            <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800 space-y-3">
              {/* 終日チェックボックス */}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="edit-all-day"
                  checked={isAllDay}
                  onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
                />
                <label htmlFor="edit-all-day" className="text-sm font-medium cursor-pointer">終日</label>
              </div>
              
              {/* 開始日時 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground w-12 flex-shrink-0">開始:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-sm">
                      <Calendar className="h-3.5 w-3.5 mr-1.5" />
                      {formatDateDisplay(scheduleStartDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={scheduleStartDate}
                      onSelect={handleScheduleStartDateChange}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {!isAllDay && (
                  <Input
                    type="time"
                    value={scheduleStartTime}
                    onChange={(e) => handleScheduleStartTimeChange(e.target.value)}
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
                      <Calendar className="h-3.5 w-3.5 mr-1.5" />
                      {formatDateDisplay(scheduleEndDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={scheduleEndDate}
                      onSelect={setScheduleEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {!isAllDay && (
                  <Input
                    type="time"
                    value={scheduleEndTime}
                    onChange={(e) => setScheduleEndTime(e.target.value)}
                    className="h-8 w-28 text-sm"
                  />
                )}
                {/* クリアボタン */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-sm text-muted-foreground"
                  onClick={clearScheduleEndDate}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Date/Time - for non-schedule categories only */}
          {category !== 'schedule' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">日時:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    {dayKey}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={parseTimestamp(`${dayKey}T00:00:00Z`)}
                    onSelect={handleDateSelect}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 w-28 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-sm"
                onClick={setToNow}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                今
              </Button>
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <div className="flex-1">
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                削除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className={currentConfig.buttonColor}
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
