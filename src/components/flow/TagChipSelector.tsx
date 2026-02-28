import { useState } from 'react';
import { Plus } from 'lucide-react';
import { icons } from 'lucide-react';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { CustomTag, TAG_COLORS, CreateCustomTagInput } from '@/hooks/useCustomTags';
import { TagEditModal } from '@/components/settings/TagEditModal';
import { cn } from '@/lib/utils';

interface TagChipSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  customTags: CustomTag[];
  onCreateTag?: (input: CreateCustomTagInput) => Promise<CustomTag | null>;
  visibleTagIds?: string[];
  showCreateButton?: boolean;
  showUnselected?: boolean;
}

const RECENT_TAGS_KEY = 'flowlog_recent_tags';

function kebabToPascal(str: string): string {
  return str.split('-').map((part) =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

function getIconComponent(iconName: string) {
  const pascalName = kebabToPascal(iconName);
  return (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName];
}

function isBaseTag(value: string | null): value is BlockTag {
  return value !== null && TAGS.includes(value as BlockTag);
}

function getRecentTagIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_TAGS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function TagChipSelector({
  value,
  onChange,
  customTags,
  onCreateTag,
  visibleTagIds,
  showCreateButton = true,
  showUnselected = true,
}: TagChipSelectorProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const allowedTagIds = visibleTagIds ?? getRecentTagIds();
  const filteredBaseTags = TAGS.filter((tagId) => allowedTagIds.includes(tagId));
  const filteredCustomTags = customTags.filter((tag) => allowedTagIds.includes(tag.id));

  const handleTagToggle = (tagId: string | null) => {
    onChange(value === tagId ? null : tagId);
  };

  const handleCreateTag = async (input: CreateCustomTagInput): Promise<boolean> => {
    if (!onCreateTag) return false;

    const newTag = await onCreateTag(input);
    if (newTag) {
      onChange(newTag.id);
      return true;
    }
    return false;
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {showUnselected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              'inline-flex min-h-9 items-center rounded-full border px-3 text-[10px] font-medium transition-colors sm:text-[11px]',
              value === null
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            未選択
          </button>
        )}

        {filteredBaseTags.map((tagId) => {
          const config = TAG_CONFIG[tagId];
          const Icon = config.icon;
          const isSelected = isBaseTag(value) && value === tagId;

          return (
            <button
              key={tagId}
              type="button"
              onClick={() => handleTagToggle(tagId)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-medium transition-all sm:text-[11px]',
                isSelected
                  ? `${config.bgColor} ${config.color} border-current`
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {config.label}
            </button>
          );
        })}

        {filteredCustomTags.map((tag) => {
          const IconComponent = getIconComponent(tag.icon);
          const colorConfig = TAG_COLORS[tag.color];
          const isSelected = value === tag.id;

          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleTagToggle(tag.id)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-medium transition-all sm:text-[11px]',
                isSelected
                  ? `${colorConfig.bg} ${colorConfig.text} border-current`
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {IconComponent && <IconComponent className={cn('h-4 w-4', isSelected ? colorConfig.text : '')} />}
              {tag.name}
            </button>
          );
        })}

        {onCreateTag && showCreateButton && (
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:text-[11px]"
          >
            <Plus className="h-4 w-4" />
            新しいタグ
          </button>
        )}
      </div>

      {onCreateTag && showCreateButton && (
        <TagEditModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onSave={handleCreateTag}
        />
      )}
    </>
  );
}
