import { useState, useEffect } from 'react';
import { icons } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  CustomTag, 
  CreateCustomTagInput, 
  TagColor, 
  TAG_COLORS, 
  AVAILABLE_ICONS,
  AvailableIcon 
} from '@/hooks/useCustomTags';

interface TagEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: CustomTag; // undefined for create, defined for edit
  onSave: (input: CreateCustomTagInput) => Promise<boolean>;
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

export function TagEditModal({ open, onOpenChange, tag, onSave }: TagEditModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<AvailableIcon>('star');
  const [color, setColor] = useState<TagColor>('blue');
  const [isSaving, setIsSaving] = useState(false);

  const isEdit = !!tag;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (tag) {
        setName(tag.name);
        setIcon(tag.icon as AvailableIcon);
        setColor(tag.color);
      } else {
        setName('');
        setIcon('star');
        setColor('blue');
      }
      setIsSaving(false);
    }
  }, [open, tag]);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setIsSaving(true);
    try {
      const success = await onSave({ name: name.trim(), icon, color });
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const colorConfig = TAG_COLORS[color];
  const PreviewIcon = getIconComponent(icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'タグを編集' : 'タグを追加'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tag name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">タグ名</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 趣味"
              maxLength={20}
            />
          </div>

          {/* Icon selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">アイコン</label>
            <div className="grid grid-cols-7 gap-2 p-3 bg-muted/30 rounded-lg max-h-40 overflow-y-auto">
              {AVAILABLE_ICONS.map((iconName) => {
                const IconComponent = getIconComponent(iconName);
                if (!IconComponent) return null;
                
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName)}
                    className={`p-2 rounded-md transition-all ${
                      icon === iconName
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <IconComponent className="h-5 w-5 mx-auto" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">色</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TAG_COLORS) as TagColor[]).map((colorKey) => {
                const config = TAG_COLORS[colorKey];
                return (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => setColor(colorKey)}
                    className={`w-10 h-10 rounded-full ${config.bg} ${config.text} flex items-center justify-center transition-all ${
                      color === colorKey
                        ? 'ring-2 ring-offset-2 ring-current scale-110'
                        : 'hover:scale-105'
                    }`}
                    title={config.label}
                  >
                    {color === colorKey && (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">プレビュー</label>
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm ${colorConfig.bg} ${colorConfig.text}`}>
                {PreviewIcon && <PreviewIcon className="h-4 w-4" />}
                <span>{name || 'タグ名'}</span>
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
