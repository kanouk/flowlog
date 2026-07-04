import { afterEach, describe, expect, it, vi } from 'vitest';
import { playCompletionSound, triggerCompletionFeedback, triggerHaptic } from './feedbackUtils';

describe('feedbackUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers navigator vibration patterns when available', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });

    triggerHaptic('light');
    triggerHaptic('medium');
    triggerHaptic('success');

    expect(vibrate).toHaveBeenNthCalledWith(1, 10);
    expect(vibrate).toHaveBeenNthCalledWith(2, 20);
    expect(vibrate).toHaveBeenNthCalledWith(3, [10, 50, 20]);
  });

  it('plays the current completion sound shape when AudioContext exists', () => {
    const oscillator = {
      connect: vi.fn(),
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      start: vi.fn(),
      stop: vi.fn(),
      type: 'square',
    };
    const gainNode = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    };
    const audioContext = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gainNode),
    };

    const AudioContextMock = vi.fn(function MockAudioContext() {
      return audioContext;
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextMock,
    });

    playCompletionSound();

    expect(audioContext.createOscillator).toHaveBeenCalledOnce();
    expect(audioContext.createGain).toHaveBeenCalledOnce();
    expect(oscillator.type).toBe('sine');
    expect(oscillator.start).toHaveBeenCalledWith(10);
    expect(oscillator.stop).toHaveBeenCalledWith(10.15);
  });

  it('combines haptic and audio feedback for completion', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
    });

    expect(() => triggerCompletionFeedback()).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith([10, 50, 20]);
  });
});
