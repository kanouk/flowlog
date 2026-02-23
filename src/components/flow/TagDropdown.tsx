import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { icons } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { CustomTag, TAG_COLORS, CreateCustomTagInput } from '@/hooks/useCustomTags';
import { TagEditModal } from '@/components/settings/TagEditModal';

interface TagDropdownProps {
  value: string | null;
  onChange: (value: string | null) => void;
  customTags: CustomTag[];
  onCreateTag?: (input: CreateCustomTagInput) => Promise<CustomTag | null>;
  className?: string;
}

const RECENT_TAGS_KEY = 'flowlog_recent_tags';
const MAX_VISIBLE_TAGS = 5;

function kebabToPascal(str: string): string {
  return str.split('-').map(part => 
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

function recordTagUsage(tagId: string): void {
  const recent = getRecentTagIds().filter(id => id !== tagId);
  recent.unshift(tagId);
  localStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(recent.slice(0, 50)));
}

type UnifiedTag =
  | { type: 'base'; id: BlockTag }
  | { type: 'custom'; id: string; tag: CustomTag };

function renderUnifiedTag(item: UnifiedTag, onClick: () => void) {
  if (item.type === 'base') {
    const config = TAG_CONFIG[item.id];
    const Icon = config.icon;
    return (
      <DropdownMenuItem key={item.id} onClick={onClick} className="gap-2">
        <span className={`inline-flex items-center ${config.color}`}>
          <Icon className="h-4 w-4" />
        </span>
        {config.label}
      </DropdownMenuItem>
    );
  }

  const colorConfig = TAG_COLORS[item.tag.color];
  const IconComponent = getIconComponent(item.tag.icon);
  return (
    <DropdownMenuItem key={item.id} onClick={onClick} className="gap-2">
      <span className={`inline-flex items-center gap-1.5 ${colorConfig.text}`}>
        {IconComponent && <IconComponent className="h-4 w-4" />}
      </span>
      {item.tag.name}
    </DropdownMenuItem>
  );
}

export function TagDropdown({ value, onChange, customTags, onCreateTag, className }: TagDropdownProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isBase = isBaseTag(value);
  const customTag = !isBase && value ? customTags.find(t => t.id === value) : null;

  const { visibleTags, otherTags } = useMemo(() => {
    const allTags: UnifiedTag[] = [
      ...TAGS.map((t): UnifiedTag => ({ type: 'base', id: t })),
      ...customTags.map((t): UnifiedTag => ({ type: 'custom', id: t.id, tag: t })),
    ];

    const recentIds = getRecentTagIds();

    if (recentIds.length === 0) {
      // 履歴なし → デフォルト順（固定タグが先、カスタムタグがあとで読む）
      return {
        visibleTags: allTags.slice(0, MAX_VISIBLE_TAGS),
        otherTags: allTags.slice(MAX_VISIBLE_TAGS),
      };
    }

    const tagById = new Map(allTags.map(t => [t.id, t]));
    const sorted: UnifiedTag[] = [];
    const usedIds = new Set<string>();

    // 最近使った順に並べる
    for (const id of recentIds) {
      const tag = tagById.get(id);
      if (tag) {
        sorted.push(tag);
        usedIds.add(id);
      }
    }

    // 履歴にないタグをデフォルト順で末尾に追加
    for (const tag of allTags) {
      if (!usedIds.has(tag.id)) {
        sorted.push(tag);
      }
    }

    return {
      visibleTags: sorted.slice(0, MAX_VISIBLE_TAGS),
      otherTags: sorted.slice(MAX_VISIBLE_TAGS),
    };
  }, [customTags]);

  const handleChange = useCallback((tagValue: string | null) => {
    if (tagValue) {
      recordTagUsage(tagValue);
    }
    onChange(tagValue);
  }, [onChange]);
  
  const renderTriggerContent = () => {
    if (isBase) {
      const config = TAG_CONFIG[value];
      const Icon = config.icon;
      return (
        <span className={`inline-flex items-center gap-1 ${config.color}`}>
          <Icon className="h-3.5 w-3.5" />
          <span>{config.label}</span>
        </span>
      );
    }
    
    if (customTag) {
      const colorConfig = TAG_COLORS[customTag.color];
      const IconComponent = getIconComponent(customTag.icon);
      return (
        <span className={`inline-flex items-center gap-1 ${colorConfig.text}`}>
          {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
          <span>{customTag.name}</span>
        </span>
      );
    }
    
    return (
      <>
        <Plus className="h-3.5 w-3.5" />
        <span>タグなし</span>
      </>
    );
  };

  const handleCreateClick = () => {
    setDropdownOpen(false);
    setTimeout(() => setCreateModalOpen(true), 100);
  };

  const handleCreateTag = async (input: CreateCustomTagInput): Promise<boolean> => {
    if (!onCreateTag) return false;
    
    const newTag = await onCreateTag(input);
    if (newTag) {
      recordTagUsage(newTag.id);
      onChange(newTag.id);
      return true;
    }
    return false;
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${className || ''}`}>
            {renderTriggerContent()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-popover min-w-[180px]">
          <DropdownMenuItem onClick={() => handleChange(null)}>
            タグなし
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {visibleTags.map((item) =>
            renderUnifiedTag(item, () => handleChange(item.id))
          )}

          {otherTags.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                その他
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                {otherTags.map((item) =>
                  renderUnifiedTag(item, () => handleChange(item.id))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          
          {onCreateTag && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleCreateClick}
                className="gap-2 text-primary"
              >
                <Plus className="h-4 w-4" />
                新しいタグを作成...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onCreateTag && (
        <TagEditModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onSave={handleCreateTag}
        />
      )}
    </>
  );
}
