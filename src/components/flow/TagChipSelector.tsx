import { useState } from 'react';
import { Plus } from 'lucide-react';
import { icons } from 'lucide-react';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { CustomTag, TAG_COLORS, CreateCustomTagInput } from '@/hooks/useCustomTags';
import { TagEditModal } from '@/components/settings/TagEditModal';
import { cn } from '@/lib/utils';
import { SelectableControl } from '@/components/ui/selectable-control';

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
          <SelectableControl
            type="button"
            onClick={() => onChange(null)}
            appearance="pill"
            size="pill"
            selected={value === null}
            className={cn(
              'min-h-9 text-[10px] font-medium sm:text-[11px]',
              value === null
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            未選択
          </SelectableControl>
        )}

        {filteredBaseTags.map((tagId) => {
          const config = TAG_CONFIG[tagId];
          const Icon = config.icon;
          const isSelected = isBaseTag(value) && value === tagId;

          return (
            <SelectableControl
              key={tagId}
              onClick={() => handleTagToggle(tagId)}
              appearance="pill"
              size="pill"
              selected={isSelected}
              className={cn(
                'min-h-9 text-[10px] font-medium sm:text-[11px]',
                isSelected
                  ? `${config.bgColor} ${config.color} border-current`
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {config.label}
            </SelectableControl>
          );
        })}

        {filteredCustomTags.map((tag) => {
          const IconComponent = getIconComponent(tag.icon);
          const colorConfig = TAG_COLORS[tag.color];
          const isSelected = value === tag.id;

          return (
            <SelectableControl
              key={tag.id}
              onClick={() => handleTagToggle(tag.id)}
              appearance="pill"
              size="pill"
              selected={isSelected}
              className={cn(
                'min-h-9 text-[10px] font-medium sm:text-[11px]',
                isSelected
                  ? `${colorConfig.bg} ${colorConfig.text} border-current`
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {IconComponent && <IconComponent className={cn('h-4 w-4', isSelected ? colorConfig.text : '')} />}
              {tag.name}
            </SelectableControl>
          );
        })}

        {onCreateTag && showCreateButton && (
          <SelectableControl
            type="button"
            onClick={() => setCreateModalOpen(true)}
            appearance="pill"
            size="pill"
            className="min-h-9 border-dashed text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-primary sm:text-[11px]"
          >
            <Plus className="h-4 w-4" />
            新しいタグ
          </SelectableControl>
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
