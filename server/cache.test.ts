import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from './cache';

test('TtlCache stores, returns fresh/stale metadata, and respects TTL', () => {
  const cache = new TtlCache(10);

  cache.set('a', 10, 500, 1_000);
  const fresh = cache.get<number>('a', 1_200);
  assert.ok(fresh !== null);
  assert.equal(fresh.entry.data, 10);
  assert.equal(fresh.isFresh, true);

  const stale = cache.get<number>('a', 1_600);
  assert.ok(stale !== null);
  assert.equal(stale.entry.data, 10);
  assert.equal(stale.isFresh, false);

  assert.equal(cache.get<number>('missing', 1_600), null);
});

test('TtlCache evicts expired entries first and bounds memory to maxEntries (>= 10)', () => {
  const cache = new TtlCache(10);

  for (let i = 0; i < 10; i += 1) {
    cache.set(`k${i}`, `v${i}`, i === 0 ? 100 : 10_000, 100);
  }
  assert.equal(cache.size(), 10);

  // At t=500, k0 is expired so inserting k10 evicts k0 first
  cache.set('k10', 'v10', 10_000, 500);
  assert.equal(cache.size(), 10);
  assert.equal(cache.get('k0', 500), null);
  assert.equal(cache.get('k10', 500)?.entry.data, 'v10');

  // Re-setting an existing key updates it without exceeding maxEntries
  cache.set('k1', 'v1-updated', 10_000, 600);
  assert.equal(cache.get('k1', 600)?.entry.data, 'v1-updated');
  assert.equal(cache.size(), 10);

  // Inserting k11 when all 10 are fresh evicts oldest FIFO entry (k2, since k1 was refreshed)
  cache.set('k11', 'v11', 10_000, 700);
  assert.equal(cache.size(), 10);
  assert.equal(cache.get('k2', 700), null);

  cache.clear();
  assert.equal(cache.size(), 0);
});
