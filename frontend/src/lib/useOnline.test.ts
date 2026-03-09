import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnline } from './useOnline.ts';

describe('useOnline', () => {
  afterEach(() => {
    // Reset to online
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  it('returns true when browser is online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('returns false when browser is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  it('updates when going offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('updates when going back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});
