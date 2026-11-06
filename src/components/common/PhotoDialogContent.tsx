import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function PhotoDialogContent({ children, className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      {...props}
      showCloseButton={false}
      aria-describedby={undefined}
      className={cn('max-w-4xl gap-0 overflow-hidden rounded-lg p-0', className)}
    >
      <DialogTitle className="sr-only">写真の拡大表示</DialogTitle>
      <div className="flex h-14 items-center justify-end px-2">
        <DialogClose
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="sr-only">写真を閉じる</span>
        </DialogClose>
      </div>
      <div className="p-2 pt-0 sm:px-4 sm:pb-4">{children}</div>
    </DialogContent>
  );
}
