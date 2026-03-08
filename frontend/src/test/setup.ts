import '@testing-library/jest-dom/vitest';

// Mock build-time constants
globalThis.__BUILD_VERSION__ = 'test-abc123' as unknown as string;
globalThis.__BUILD_TIME__ = '2026-01-01T00:00:00Z' as unknown as string;

// Mock navigator.serviceWorker for tests that reference it
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  value: {
    ready: Promise.resolve({ active: null }),
    getRegistration: () => Promise.resolve(undefined),
  },
  writable: true,
});
