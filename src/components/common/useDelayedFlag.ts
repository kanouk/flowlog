import { useEffect, useState } from 'react';

export function useDelayedFlag(value: boolean, delayMs = 150): boolean {
  const [delayedValue, setDelayedValue] = useState(false);

  useEffect(() => {
    if (!value) {
      setDelayedValue(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setDelayedValue(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return delayedValue;
}
