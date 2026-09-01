import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { closeDb } from '../src/db/schema';

// jsdom does not implement these; the app only uses them defensively.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom defines scrollTo but throws "not implemented" when called.
window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;

if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...globalThis.crypto,
      randomUUID: () => {
        counter += 1;
        return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
      },
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const view = new Uint8Array(array.buffer);
        for (let i = 0; i < view.length; i += 1) view[i] = (i * 7 + 13) % 256;
        return array;
      },
    },
  });
}

// jsdom has no ResizeObserver; charts fall back to their default width.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

beforeEach(async () => {
  // Every test starts from an empty database.
  await closeDb();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('personal-life-dashboard');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});
