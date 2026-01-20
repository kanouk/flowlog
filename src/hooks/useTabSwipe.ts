import { useEffect, useRef, useCallback } from 'react';

interface TabSwipeConfig {
  onSwipeLeft?: () => void;  // 次のタブへ
  onSwipeRight?: () => void; // 前のタブへ
  minSwipeDistance?: number;
  enabled?: boolean;
}

/**
 * タブ切り替え用のスワイプジェスチャーフック
 * 画面全体でスワイプを検知（サイドバー用とは異なり、開始位置の制限なし）
 */
export function useTabSwipe(config: TabSwipeConfig) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const { enabled = true } = config;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);

    const minDistance = config.minSwipeDistance || 60;

    // 水平方向の移動が垂直より大きく、最小距離を超えた場合
    if (Math.abs(deltaX) > minDistance && deltaY < 80) {
      if (deltaX < 0) {
        // 左スワイプ → 次のタブ
        config.onSwipeLeft?.();
      } else {
        // 右スワイプ → 前のタブ
        config.onSwipeRight?.();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [config, enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd, enabled]);
}
