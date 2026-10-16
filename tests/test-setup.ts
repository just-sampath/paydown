/**
 * Marks every test file as a React act environment so `act()` warnings are
 * suppressed and React flushes effects synchronously during tests.
 */
const globalWithAct = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };

globalWithAct.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Node 22+ ships its own `localStorage` global, which is undefined unless Node is started
 * with `--localstorage-file` and shadows jsdom's. Provide an in-memory Storage instead.
 */
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage implements Storage {
    private items = new Map<string, string>();

    get length(): number {
      return this.items.size;
    }

    clear(): void {
      this.items.clear();
    }

    getItem(key: string): string | null {
      return this.items.get(key) ?? null;
    }

    key(index: number): string | null {
      return Array.from(this.items.keys())[index] ?? null;
    }

    removeItem(key: string): void {
      this.items.delete(key);
    }

    setItem(key: string, value: string): void {
      this.items.set(key, String(value));
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
}
