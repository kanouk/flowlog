import { ChevronDown, Tag } from 'lucide-react';
import { icons } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { BlockTag, TAGS, TAG_CONFIG } from '@/lib/categoryUtils';
import { CustomTag, TAG_COLORS } from '@/hooks/useCustomTags';
import { cn } from '@/lib/utils';

interface TagFilterDropdownProps {
  value: string | null; // 'all' | BlockTag | customTagId
  onChange: (value: string | null) => void;
  customTags?: CustomTag[];
  className?: string;
}

function kebabToPascal(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function getIconComponent(iconName: string) {
  const pascalName = kebabToPascal(iconName);
  return (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName] || Tag;
}

function isBaseTag(value: string | null): value is BlockTag {
  return value !== null && TAGS.includes(value as BlockTag);
}

export function TagFilterDropdown({ 
  value, 
  onChange, 
  customTags = [],
  className 
}: TagFilterDropdownProps) {
  // Determine current display
  const getCurrentDisplay = () => {
    if (!value || value === 'all') {
      return {
        icon: Tag,
        label: '全タグ',
        colorClass: 'text-muted-foreground',
        bgClass: '',
      };
    }
    
    if (isBaseTag(value)) {
      const config = TAG_CONFIG[value];
      return {
        icon: config.icon,
        label: config.label,
        colorClass: config.color,
        bgClass: config.bgColor,
      };
    }
    
    // Custom tag
    const customTag = customTags.find(t => t.id === value);
    if (customTag) {
      const colorConfig = TAG_COLORS[customTag.color as keyof typeof TAG_COLORS];
      const IconComponent = getIconComponent(customTag.icon);
      return {
        icon: IconComponent,
        label: customTag.name,
        colorClass: colorConfig?.text || 'text-foreground',
        bgClass: colorConfig?.bg || '',
      };
    }
    
    return {
      icon: Tag,
      label: '全タグ',
      colorClass: 'text-muted-foreground',
      bgClass: '',
    };
  };

  const display = getCurrentDisplay();
  const DisplayIcon = display.icon;
  const hasCustomTags = customTags.length > 0;
  const isFiltering = value && value !== 'all';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors",
            isFiltering 
              ? `${display.bgClass} ${display.colorClass} border-current/20` 
              : "border-border bg-background hover:bg-muted",
            className
          )}
        >
          <DisplayIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{display.label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {/* All tags option */}
        <DropdownMenuItem
          onClick={() => onChange(null)}
          className={cn(!value || value === 'all' ? 'bg-muted' : '')}
        >
          <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
          全タグ
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
              className={cn(value === t ? 'bg-muted' : '')}
            >
              <Icon className={cn("h-4 w-4 mr-2", config.color)} />
              {config.label}
            </DropdownMenuItem>
          );
        })}
        
        {/* Custom tags submenu */}
        {hasCustomTags && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                その他
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {customTags.map((tag) => {
                  const colorConfig = TAG_COLORS[tag.color as keyof typeof TAG_COLORS];
                  const IconComponent = getIconComponent(tag.icon);
                  return (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => onChange(tag.id)}
                      className={cn(value === tag.id ? 'bg-muted' : '')}
                    >
                      <IconComponent className={cn("h-4 w-4 mr-2", colorConfig?.text)} />
                      {tag.name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
