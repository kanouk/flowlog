import { useState, useRef, KeyboardEvent, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Camera, ChevronDown, ChevronUp, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { SelectableControl } from '@/components/ui/selectable-control';
import { AddBlockMode } from '@/hooks/useEntries';
import { useAuth } from '@/hooks/useAuth';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useImageAttachments } from '@/hooks/useImageAttachments';
import { useCustomTags } from '@/hooks/useCustomTags';
import { toast } from 'sonner';
import { PrioritySelector } from './PrioritySelector';
import { TagChipSelector } from './TagChipSelector';
import type { TaskPriority as TaskPriorityValue } from '@/lib/taskPriority';
import {
  BlockCategory,
  CATEGORIES,
  CATEGORY_CONFIG,
  TAGS,
  setLastCategory,
  setLastTag,
} from '@/lib/categoryUtils';
import { supabase } from '@/integrations/supabase/client';
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
    batchMode?: boolean,
    dueData?: {
      due_at: string | null;
      due_all_day: boolean;
    }
  ) => boolean | Promise<boolean>;
  disabled?: boolean;
  selectedDate: string;
  isToday: boolean;
}

interface SubmissionSnapshot {
  content: string;
  images: File[];
  category: BlockCategory;
  tag: string | null;
  priority: TaskPriorityValue;
  batchMode: boolean;
  isAllDay: boolean;
  startDate?: Date;
  startTime: string;
  endDate?: Date;
  endTime: string;
  dueDate?: Date;
  dueTime: string;
  dueAllDay: boolean;
}

const DRAFT_KEY_PREFIX = 'flowlog_draft_';
const CATEGORY_KEYBOARD_ORDER: BlockCategory[] = CATEGORIES;

function triggerLightHaptic(): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

export function FlowInput({ onSubmit, disabled, selectedDate, isToday }: FlowInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [category, setCategory] = useState<BlockCategory>('event');
  const [tag, setTag] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriorityValue>(0);
  const [showAllTags, setShowAllTags] = useState(false);
  const [topTagIds, setTopTagIds] = useState<string[]>([]);
  const [animatingCategory, setAnimatingCategory] = useState<BlockCategory | null>(null);
  const [batchMode, setBatchMode] = useState<boolean>(() => {
    return sessionStorage.getItem('flowlog_batch_mode') === 'true';
  });

  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState('10:00');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const reviewOpenedAtRef = useRef<number>(0);
  const submitLockedRef = useRef(false);
  const { uploadImages, maxImages } = useImageUpload();
  const {
    selectedImages,
    previewUrls,
    handleImageSelect,
    handlePaste,
    removeImage,
    resetImages,
    restoreImages,
  } = useImageAttachments({ maxImages });
  const { user } = useAuth();
  const { customTags, createCustomTag } = useCustomTags();

  const focusTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      focusTextarea();
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusTextarea]);

  useEffect(() => {
    const draft = sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    if (draft) {
      setContent(draft);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, 0);
    } else {
      setContent('');
    }

    setIsReviewOpen(false);
    setCategory('event');
    setTag(null);
    setPriority(0);
    setShowAllTags(false);
    setIsAllDay(false);
    setStartDate(undefined);
    setStartTime('09:00');
    setEndDate(undefined);
    setEndTime('10:00');
    setLastCategory('event');
    setLastTag(null);

    focusTextarea();
  }, [focusTextarea, resetImages, selectedDate]);

  useEffect(() => {
    if (content) {
      sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${selectedDate}`, content);
    } else {
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    }
  }, [content, selectedDate]);

  useEffect(() => {
    if (category === 'schedule' && !startDate) {
      const defaults = getDefaultScheduleState();
      setStartDate(defaults.startDate);
      setStartTime(defaults.startTime);
      setEndDate(defaults.endDate);
      setEndTime(defaults.endTime);
    }
  }, [category, startDate]);

  useEffect(() => {
    if (!user) {
      setTopTagIds([]);
      return;
    }

    let cancelled = false;

    const loadTopTags = async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('tag, occurred_at')
        .eq('user_id', user.id)
        .not('tag', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Failed to load recent tags:', error);
        return;
      }

      const nextTopTagIds: string[] = [];
      for (const row of data ?? []) {
        const tagId = row.tag;
        if (!tagId || nextTopTagIds.includes(tagId)) continue;
        nextTopTagIds.push(tagId);
        if (nextTopTagIds.length === 3) break;
      }

      if (!cancelled) {
        setTopTagIds(nextTopTagIds);
      }
    };

    loadTopTags();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCategoryChange = useCallback((cat: BlockCategory) => {
    setCategory(cat);
    setLastCategory(cat);
    setTag(null);
    setLastTag(null);
    setPriority(0);
    setAnimatingCategory(cat);
    triggerLightHaptic();
  }, []);

  const handleTagChange = (nextTag: string | null) => {
    setTag(nextTag);
    setLastTag(nextTag);
    triggerLightHaptic();
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const canContinue = (content.trim().length > 0 || selectedImages.length > 0) && !disabled && !isSubmitting;
  const canSaveSchedule = category === 'schedule' && startDate;
  const canSave = (content.trim().length > 0 || selectedImages.length > 0 || canSaveSchedule) && !disabled && !isSubmitting;

  const resetForm = useCallback(() => {
    setContent('');
    sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedDate}`);
    resetImages();
    setIsReviewOpen(false);
    setCategory('event');
    setTag(null);
    setPriority(0);
    setShowAllTags(false);
    setIsAllDay(false);
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime('09:00');
    setEndTime('10:00');
    setLastCategory('event');
    setLastTag(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    focusTextarea();
  }, [focusTextarea, resetImages, selectedDate]);

  const restoreForm = useCallback((snapshot: SubmissionSnapshot) => {
    setContent(snapshot.content);
    restoreImages(snapshot.images);
    setCategory(snapshot.category);
    setTag(snapshot.tag);
    setPriority(snapshot.priority);
    setBatchMode(snapshot.batchMode);
    setShowAllTags(false);
    setIsAllDay(snapshot.isAllDay);
    setStartDate(snapshot.startDate);
    setStartTime(snapshot.startTime);
    setEndDate(snapshot.endDate);
    setEndTime(snapshot.endTime);
    setLastCategory(snapshot.category);
    setLastTag(snapshot.tag);
    setIsReviewOpen(false);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    });

    focusTextarea();
  }, [focusTextarea, restoreImages]);

  const handleOpenReview = () => {
    if (!canContinue) return;
    reviewOpenedAtRef.current = Date.now();
    triggerLightHaptic();
    setIsReviewOpen(true);
  };

  const handleSubmitWithMode = useCallback(async (mode: AddBlockMode) => {
    if (submitLockedRef.current) return;

    const trimmedContent = content.trim();
    const imagesToUpload = [...selectedImages];
    const hasContent = trimmedContent.length > 0;
    const hasImages = imagesToUpload.length > 0;

    if (category === 'schedule' && !startDate) {
      toast.error('開始日を選択してください');
      return;
    }

    if (!hasContent && !hasImages && category !== 'schedule') return;
    if (disabled) return;

    let scheduleData = undefined;
    if (category === 'schedule') {
      const startsAt = buildScheduleDateTime(startDate, startTime, isAllDay);
      const endsAt = buildScheduleDateTime(endDate, endTime, isAllDay);

      if (endsAt && startsAt && new Date(endsAt) < new Date(startsAt)) {
        toast.error('終了日時は開始日時より後にしてください');
        return;
      }

      scheduleData = {
        starts_at: startsAt,
        ends_at: endsAt,
        is_all_day: isAllDay,
      };
    }

    const submitCategory = category;
    const submitTag = tag;
    const submitPriority = category === 'task' ? priority : 0;
    const isBatch = submitCategory === 'task' && batchMode && imagesToUpload.length === 0;
    const submissionSnapshot: SubmissionSnapshot = {
      content: trimmedContent,
      images: imagesToUpload,
      category: submitCategory,
      tag: submitTag,
      priority,
      batchMode,
      isAllDay,
      startDate,
      startTime,
      endDate,
      endTime,
    };

    submitLockedRef.current = true;
    setIsSubmitting(true);
    resetForm();
    setIsSubmitting(false);

    void (async () => {
      try {
        let uploadedUrls: string[] = [];
        if (hasImages) {
          uploadedUrls = await uploadImages(imagesToUpload);
          if (uploadedUrls.length !== imagesToUpload.length) {
            toast.warning('一部の画像のアップロードに失敗しました');
          }
        }

        const submitted = await onSubmit(
          trimmedContent,
          mode,
          uploadedUrls,
          submitCategory,
          submitTag,
          scheduleData,
          submitPriority,
          isBatch
        );
        if (!submitted) {
          restoreForm(submissionSnapshot);
        }
      } catch (error) {
        console.error('Background submit failed:', error);
        restoreForm(submissionSnapshot);
      }
    })();
    submitLockedRef.current = false;
  }, [
    category,
    content,
    disabled,
    endDate,
    endTime,
    isAllDay,
    onSubmit,
    priority,
    resetForm,
    restoreForm,
    selectedImages,
    startDate,
    startTime,
    tag,
    uploadImages,
    batchMode,
  ]);

  useEffect(() => {
    if (!isReviewOpen) return;

    const handleReviewKeydown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isFormField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (Date.now() - reviewOpenedAtRef.current < 300) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        handleSubmitWithMode('toSelectedDate');
        return;
      }

      if (event.key === 'Enter' && !isFormField) {
        event.preventDefault();
        handleSubmitWithMode('toSelectedDate');
        return;
      }

      if (isFormField) return;

      const currentIndex = CATEGORY_KEYBOARD_ORDER.indexOf(category);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      switch (event.key) {
        case 'ArrowRight':
          nextIndex = Math.min(currentIndex + 1, CATEGORY_KEYBOARD_ORDER.length - 1);
          break;
        case 'ArrowLeft':
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'ArrowDown':
          nextIndex = Math.min(currentIndex + 1, CATEGORY_KEYBOARD_ORDER.length - 1);
          break;
        case 'ArrowUp':
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        default:
          return;
      }

      event.preventDefault();
      handleCategoryChange(CATEGORY_KEYBOARD_ORDER[nextIndex]);
    };

    window.addEventListener('keydown', handleReviewKeydown);
    return () => {
      window.removeEventListener('keydown', handleReviewKeydown);
    };
  }, [category, handleCategoryChange, handleSubmitWithMode, isReviewOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canContinue) {
        handleOpenReview();
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
    handleImageSelect(e);
  };

  const currentConfig = CATEGORY_CONFIG[category];
  const allTagIds = [...TAGS, ...customTags.map((customTag) => customTag.id)];
  const visibleTopTagIds = topTagIds.filter((tagId) => allTagIds.includes(tagId)).slice(0, 3);
  const remainingTagIds = allTagIds.filter((tagId) => !visibleTopTagIds.includes(tagId));

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl bg-card ${!isToday ? 'bg-muted/50' : ''}`}
        style={{ boxShadow: '0 4px 20px -4px rgba(0,0,0,0.1)' }}
      >
        <div className="p-6">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="今、思い出したことを書く…"
            disabled={disabled || isSubmitting}
            className="input-flow w-full min-h-[120px] text-lg leading-relaxed"
            rows={4}
          />

          {previewUrls.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {previewUrls.map((url, i) => (
                <div
                  key={url}
                  className="group relative h-20 w-20 animate-thumbnail-enter"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full rounded-md border border-border object-cover shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
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
                className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedImages.length >= maxImages ? 'opacity-50' : ''}`}
              >
                <ImagePlus className="h-4 w-4" />
              </button>

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
                className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedImages.length >= maxImages ? 'opacity-50' : ''}`}
              >
                <Camera className="h-4 w-4" />
              </button>

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
              <Button
                size="sm"
                onClick={handleOpenReview}
                disabled={!canContinue}
                className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                <ArrowRight className="mr-1 h-4 w-4" />
                次へ
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Sheet open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-3xl px-5 pb-8 pt-8 sm:px-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusTextarea();
          }}
        >
          <div className="animate-review-enter space-y-5">
            <section className="animate-fade-up space-y-3">
              <div className="hidden text-xs text-muted-foreground md:block">矢印キーで移動 / Enterで保存</div>
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.map((cat) => {
                  const config = CATEGORY_CONFIG[cat];
                  const Icon = config.icon;
                  const isSelected = category === cat;

                  return (
                    <SelectableControl
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      onAnimationEnd={() => {
                        if (animatingCategory === cat) {
                          setAnimatingCategory(null);
                        }
                      }}
                      appearance="card"
                      size="card"
                      selected={isSelected}
                      className={`aspect-square min-w-0 flex-col focus-visible:ring-0 focus-visible:ring-offset-0 ${
                        isSelected
                          ? `${config.bgColor} ${config.color} ${config.borderColor} shadow-sm`
                          : 'border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted/20'
                      } ${animatingCategory === cat ? 'animate-selection-pop' : ''}`}
                    >
                      <Icon className="h-5 w-5 shrink-0 sm:h-5.5 sm:w-5.5 md:h-7 md:w-7" />
                      <span className="break-keep text-[9px] font-semibold leading-tight tracking-tight sm:text-[10px] md:text-xs">
                        {config.label}
                      </span>
                    </SelectableControl>
                  );
                })}
              </div>
            </section>

            {allTagIds.length > 0 && (
              <section className="animate-fade-up space-y-2" style={{ animationDelay: '40ms' }}>
                <TagChipSelector
                  value={tag}
                  onChange={handleTagChange}
                  customTags={customTags}
                  visibleTagIds={visibleTopTagIds}
                  showCreateButton={false}
                />
                {showAllTags && (
                  <div className="space-y-2">
                    <TagChipSelector
                      value={tag}
                      onChange={handleTagChange}
                      customTags={customTags}
                      onCreateTag={createCustomTag}
                      visibleTagIds={remainingTagIds}
                      showUnselected={false}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllTags(false);
                        triggerLightHaptic();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      閉じる
                    </button>
                  </div>
                )}
                {!showAllTags && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllTags(true);
                      triggerLightHaptic();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    その他のタグ
                  </button>
                )}
              </section>
            )}

            {category === 'task' && (
              <section className="animate-fade-up space-y-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-4 dark:border-orange-900/40 dark:bg-orange-950/20" style={{ animationDelay: '80ms' }}>
                <h3 className="text-sm font-medium text-foreground">タスク設定</h3>
                <PrioritySelector
                  value={priority}
                  onChange={setPriority}
                  disabled={disabled || isSubmitting}
                />
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="batch-mode"
                    checked={batchMode && selectedImages.length === 0}
                    onCheckedChange={(checked) => {
                      setBatchMode(checked);
                      sessionStorage.setItem('flowlog_batch_mode', String(checked));
                      triggerLightHaptic();
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
                    <span className="text-xs text-muted-foreground/70">1行ごとにタスク化します</span>
                  )}
                </div>
              </section>
            )}

            {category === 'schedule' && (
              <section className="animate-fade-up space-y-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20" style={{ animationDelay: '80ms' }}>
                <h3 className="text-sm font-medium text-foreground">予定の詳細</h3>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="all-day"
                    checked={isAllDay}
                    onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
                  />
                  <label htmlFor="all-day" className="cursor-pointer text-sm font-medium">
                    終日
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-12 flex-shrink-0 text-sm text-muted-foreground">開始</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 px-3 text-sm">
                          {formatScheduleDateDisplay(startDate)}
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
                          setEndTime(`${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
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
                        className="h-9 w-28 text-sm"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-12 flex-shrink-0 text-sm text-muted-foreground">終了</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 px-3 text-sm">
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
                        className="h-9 w-28 text-sm"
                      />
                    )}
                    {endDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-sm text-muted-foreground"
                        onClick={() => setEndDate(undefined)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            )}

            <div className="animate-fade-up sticky bottom-0 flex gap-3 border-t border-border bg-background/95 pb-1 pt-4 backdrop-blur" style={{ animationDelay: '120ms' }}>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setIsReviewOpen(false)}
                className="flex-1"
                disabled={isSubmitting}
              >
                <ArrowLeft className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                戻る
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  triggerLightHaptic();
                  handleSubmitWithMode('toSelectedDate');
                }}
                disabled={!canSave}
                className={`flex-1 active:scale-[0.98] ${currentConfig.buttonColor} disabled:opacity-50`}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin md:h-5 md:w-5" />
                ) : (
                  <Send className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                )}
                {isToday ? `${currentConfig.label}として保存` : `${currentConfig.label}として追加`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
