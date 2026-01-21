import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag as TagIcon, Loader2 } from 'lucide-react';
import { icons } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCustomTags, CustomTag, CreateCustomTagInput, TAG_COLORS } from '@/hooks/useCustomTags';
import { TAG_CONFIG, TAGS, BlockTag } from '@/lib/categoryUtils';
import { TagEditModal } from './TagEditModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

export function TagManagementSection() {
  const { customTags, loading, createCustomTag, updateCustomTag, deleteCustomTag } = useCustomTags();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<CustomTag | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<CustomTag | null>(null);

  const handleCreateClick = () => {
    setEditingTag(undefined);
    setEditModalOpen(true);
  };

  const handleEditClick = (tag: CustomTag) => {
    setEditingTag(tag);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (tag: CustomTag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleSave = async (input: CreateCustomTagInput): Promise<boolean> => {
    if (editingTag) {
      return await updateCustomTag(editingTag.id, input);
    } else {
      const result = await createCustomTag(input);
      return result !== null;
    }
  };

  const handleDeleteConfirm = async () => {
    if (tagToDelete) {
      await deleteCustomTag(tagToDelete.id);
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Base tags (read-only) */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">基本タグ（編集不可）</h3>
        <div className="space-y-2">
          {TAGS.map((tagKey) => {
            const config = TAG_CONFIG[tagKey];
            const Icon = config.icon;
            return (
              <div
                key={tagKey}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm ${config.bgColor} ${config.color}`}>
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">システム</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom tags */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">カスタムタグ</h3>
        
        {customTags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            カスタムタグはまだありません
          </p>
        ) : (
          <div className="space-y-2">
            {customTags.map((tag) => {
              const colorConfig = TAG_COLORS[tag.color];
              const IconComponent = getIconComponent(tag.icon);
              
              return (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm ${colorConfig.bg} ${colorConfig.text}`}>
                      {IconComponent && <IconComponent className="h-4 w-4" />}
                      {tag.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditClick(tag)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(tag)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add button */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleCreateClick}
        >
          <Plus className="h-4 w-4" />
          新しいタグを追加
        </Button>
      </div>

      {/* Edit Modal */}
      <TagEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        tag={editingTag}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{tagToDelete?.name}」を削除します。このタグが付けられたログからはタグが外れます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
