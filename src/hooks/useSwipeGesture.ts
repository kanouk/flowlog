import { useEffect, useRef, useCallback } from 'react';

interface SwipeConfig {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  minSwipeDistance?: number;
}

export function useSwipeGesture(config: SwipeConfig) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    // 左端すぎる場所（ブラウザの「戻る」ジェスチャー領域）は除外
    // 30px〜150pxあたりから開始したスワイプを検知
    if (touch.clientX > 30 && touch.clientX < 150) {
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    } else {
      touchStartX.current = null;
      touchStartY.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);

    const minDistance = config.minSwipeDistance || 50;

    // 水平方向の移動が垂直より大きく、最小距離を超えた場合
    if (Math.abs(deltaX) > minDistance && deltaY < 100) {
      if (deltaX > 0) {
        config.onSwipeRight?.();
      } else {
        config.onSwipeLeft?.();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [config]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);
}
