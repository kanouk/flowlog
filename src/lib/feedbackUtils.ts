// Haptic feedback (supported devices only)
export const triggerHaptic = (type: 'light' | 'medium' | 'success' = 'success') => {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'success':
        navigator.vibrate([10, 50, 20]); // short-pause-short pattern
        break;
    }
  }
};

// Completion sound using Web Audio API (light "pop" sound)
export const playCompletionSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant ascending tone
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.08);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.12);
    
    // Quick fade out
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.type = 'sine';
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch (e) {
    // Ignore if Audio API is not supported
  }
};

// Full completion feedback
export const triggerCompletionFeedback = () => {
  triggerHaptic('success');
  playCompletionSound();
};
