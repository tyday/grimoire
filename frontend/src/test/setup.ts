import '@testing-library/jest-dom/vitest';

// Mock build-time constants
(globalThis as Record<string, unknown>).__BUILD_VERSION__ = 'test-abc123';
(globalThis as Record<string, unknown>).__BUILD_TIME__ = '2026-01-01T00:00:00Z';

// Mock navigator.serviceWorker for tests that reference it
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  value: {
    ready: Promise.resolve({ active: null }),
    getRegistration: () => Promise.resolve(undefined),
  },
  writable: true,
});
