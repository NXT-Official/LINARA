/**
 * Node 25 turns on its own Web Storage by default. Without a
 * --localstorage-file it hands out a `localStorage` whose methods are
 * missing, and it sits on the global ahead of jsdom's, so
 * `window.localStorage.clear()` throws in jsdom tests (QA, 2026-10-02).
 * Where that's the case, put a plain in-memory Storage in its place. On
 * older Node, and in the node environment, the existing one is left alone.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

function usable(storage: Storage | undefined): boolean {
  try {
    return typeof storage?.clear === "function" && typeof storage.getItem === "function";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    let current: Storage | undefined;
    try {
      current = globalThis[name];
    } catch {
      current = undefined;
    }
    if (!usable(current)) {
      Object.defineProperty(globalThis, name, {
        value: new MemoryStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
