import { SlidersHorizontal, X } from 'lucide-react';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { CustomTag } from '@/hooks/useCustomTags';
import { cn } from '@/lib/utils';
import { TagFilterDropdown } from './TagFilterDropdown';

interface StockFilterPanelProps {
  tagFilter: string;
  onTagChange: (value: string | null) => void;
  customTags: CustomTag[];
  onClear: () => void;
  stateFilter?: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  };
  tone: 'purple' | 'green';
}

/** Matches the task filter layout while retaining each collection's states. */
export function StockFilterPanel({ tagFilter, onTagChange, customTags, onClear, stateFilter, tone }: StockFilterPanelProps) {
  const activeTagLabel = tagFilter === 'all' ? null : TAGS.includes(tagFilter as BlockTag)
    ? TAG_CONFIG[tagFilter as BlockTag].label
    : customTags.find(tag => tag.id === tagFilter)?.name ?? tagFilter;
  const activeState = stateFilter?.value !== 'all'
    ? stateFilter?.options.find(option => option.value === stateFilter.value)
    : undefined;
  const hasActiveFilters = tagFilter !== 'all' || !!activeState;
  const selectedClass = tone === 'green' ? 'bg-green-500 text-white shadow-sm' : 'bg-purple-500 text-white shadow-sm';
  const stateChipClass = tone === 'green' ? 'bg-green-500/10 text-green-600' : 'bg-purple-500/10 text-purple-600';

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        フィルタ
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {stateFilter ? (
            <div className="flex items-center gap-3">
              <span className="w-10 text-xs font-medium text-muted-foreground">状態</span>
              <div className="inline-flex rounded-full border border-border bg-background p-1">
                {stateFilter.options.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={stateFilter.value === option.value}
                    onClick={() => stateFilter.onChange(option.value)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      stateFilter.value === option.value ? selectedClass : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-10 text-xs font-medium text-muted-foreground">タグ</span>
              <TagFilterDropdown value={tagFilter === 'all' ? null : tagFilter} onChange={onTagChange} customTags={customTags} className="h-9 rounded-full px-3" />
            </div>
          )}
          {hasActiveFilters && (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
              <X className="h-3.5 w-3.5" />
              フィルタをクリア
            </button>
          )}
        </div>
        {stateFilter && (
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs font-medium text-muted-foreground">タグ</span>
            <TagFilterDropdown value={tagFilter === 'all' ? null : tagFilter} onChange={onTagChange} customTags={customTags} className="h-9 rounded-full px-3" />
          </div>
        )}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {activeState && <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', stateChipClass)}>状態: {activeState.label}</span>}
            {activeTagLabel && <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">タグ: {activeTagLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
