/**
 * Bounded in-memory TTL cache with stale-while-revalidate metadata.
 * Prevents unbounded memory growth under query-parameter enumeration.
 */
export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = Math.max(10, maxEntries);
  }

  get<T>(key: string, now = Date.now()): { entry: CacheEntry<T>; isFresh: boolean } | null {
    const raw = this.store.get(key) as CacheEntry<T> | undefined;
    if (!raw) return null;
    const isFresh = now - raw.fetchedAt < raw.ttlMs;
    return { entry: raw, isFresh };
  }

  set<T>(key: string, data: T, ttlMs: number, now = Date.now()): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this.evict(now);
    }
    this.store.set(key, { data, fetchedAt: now, ttlMs });
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  private evict(now: number): void {
    for (const [key, entry] of this.store) {
      if (now - entry.fetchedAt >= entry.ttlMs) {
        this.store.delete(key);
      }
    }
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }
}
