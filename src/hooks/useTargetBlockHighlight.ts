import { useEffect } from 'react';

interface UseTargetBlockHighlightOptions {
  targetBlockId?: string | null;
  enabled: boolean;
  onTargetHandled?: () => void;
  onHighlightCleared?: () => void;
}

export function useTargetBlockHighlight({
  targetBlockId,
  enabled,
  onTargetHandled,
  onHighlightCleared,
}: UseTargetBlockHighlightOptions) {
  useEffect(() => {
    if (!targetBlockId || !enabled) return;

    const element = document.getElementById(`block-${targetBlockId}`);
    if (!element) return;

    let removeHighlightTimer: ReturnType<typeof setTimeout> | undefined;
    let clearSearchTimer: ReturnType<typeof setTimeout> | undefined;

    const scrollTimer = setTimeout(() => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      element.classList.add('block-highlight');
      removeHighlightTimer = setTimeout(() => {
        element.classList.remove('block-highlight');
      }, 2000);

      onTargetHandled?.();

      clearSearchTimer = setTimeout(() => {
        onHighlightCleared?.();
      }, 5000);
    }, 100);

    return () => {
      clearTimeout(scrollTimer);
      if (removeHighlightTimer) clearTimeout(removeHighlightTimer);
      if (clearSearchTimer) clearTimeout(clearSearchTimer);
      element.classList.remove('block-highlight');
    };
  }, [targetBlockId, enabled, onTargetHandled, onHighlightCleared]);
}
