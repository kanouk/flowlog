import { useState } from 'react';
import { Plus, ChevronDown, Settings } from 'lucide-react';
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
  value: string | null; // BaseBlockTag or custom tag ID
  onChange: (value: string | null) => void;
  customTags: CustomTag[];
  onCreateTag?: (input: CreateCustomTagInput) => Promise<CustomTag | null>;
  className?: string;
}

// アイコン名をPascalCaseに変換
function kebabToPascal(str: string): string {
  return str.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

// アイコンコンポーネントを取得
function getIconComponent(iconName: string) {
  const pascalName = kebabToPascal(iconName);
  return (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName];
}

// Check if value is a base tag
function isBaseTag(value: string | null): value is BlockTag {
  return value !== null && TAGS.includes(value as BlockTag);
}

export function TagDropdown({ value, onChange, customTags, onCreateTag, className }: TagDropdownProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Determine display state
  const isBase = isBaseTag(value);
  const customTag = !isBase && value ? customTags.find(t => t.id === value) : null;
  
  const renderTriggerContent = () => {
    if (isBase) {
      const config = TAG_CONFIG[value];
      const Icon = config.icon;
      return (
        <>
          <Icon className="h-3.5 w-3.5" />
          <span>{config.label}</span>
        </>
      );
    }
    
    if (customTag) {
      const colorConfig = TAG_COLORS[customTag.color];
      const IconComponent = getIconComponent(customTag.icon);
      return (
        <>
          {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
          <span>{customTag.name}</span>
        </>
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
    // Small delay to avoid UI flicker
    setTimeout(() => setCreateModalOpen(true), 100);
  };

  const handleCreateTag = async (input: CreateCustomTagInput): Promise<boolean> => {
    if (!onCreateTag) return false;
    
    const newTag = await onCreateTag(input);
    if (newTag) {
      // Auto-select the newly created tag
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
          {/* No tag option */}
          <DropdownMenuItem onClick={() => onChange(null)}>
            タグなし
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* Base tags */}
          {TAGS.map((t) => {
            const config = TAG_CONFIG[t];
            const Icon = config.icon;
            return (
              <DropdownMenuItem 
                key={t} 
                onClick={() => onChange(t)} 
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                {config.label}
              </DropdownMenuItem>
            );
          })}
          
          {/* Custom tags section */}
          {customTags.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ChevronDown className="h-4 w-4" />
                  その他
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-popover">
                  {customTags.map((tag) => {
                    const colorConfig = TAG_COLORS[tag.color];
                    const IconComponent = getIconComponent(tag.icon);
                    return (
                      <DropdownMenuItem 
                        key={tag.id} 
                        onClick={() => onChange(tag.id)} 
                        className="gap-2"
                      >
                        <span className={`inline-flex items-center gap-1.5 ${colorConfig.text}`}>
                          {IconComponent && <IconComponent className="h-4 w-4" />}
                        </span>
                        {tag.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          
          {/* Add new tag option */}
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

      {/* Create tag modal */}
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
