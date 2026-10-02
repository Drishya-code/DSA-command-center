import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebouncedSyncQueue } from '@/lib/debouncedSyncQueue';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('DebouncedSyncQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces rapid clicks and syncs the latest checkbox state after 600 ms', async () => {
    let checked = false;
    const seen: boolean[] = [];
    const sync = vi.fn(async () => { seen.push(checked); });
    const queue = new DebouncedSyncQueue(sync, vi.fn());
    checked = true; queue.schedule();
    await vi.advanceTimersByTimeAsync(250);
    checked = false; queue.schedule();
    await vi.advanceTimersByTimeAsync(599);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([false]);
    queue.dispose();
  });

  it('preserves an uncheck made while the earlier sync is pending', async () => {
    let checked = true;
    const first = deferred();
    const seen: boolean[] = [];
    const sync = vi.fn(async () => {
      seen.push(checked);
      if (seen.length === 1) await first.promise;
    });
    const queue = new DebouncedSyncQueue(sync, vi.fn());
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    checked = false;
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600); // debounce expires during request
    expect(sync).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(seen).toEqual([true, false]);
    queue.dispose();
  });

  it('never overlaps requests and flushes the latest state after a pending request', async () => {
    let value = 1;
    let inFlight = 0;
    let maxInFlight = 0;
    const first = deferred();
    const seen: number[] = [];
    const sync = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(value);
      if (seen.length === 1) await first.promise;
      inFlight -= 1;
    });
    const queue = new DebouncedSyncQueue(sync, vi.fn());
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    value = 2;
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    expect(sync).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(seen).toEqual([1, 2]);
    expect(maxInFlight).toBe(1);
    queue.dispose();
  });

  it('marks an in-flight response stale when newer local work arrives', async () => {
    let value = 'old';
    const first = deferred();
    const applied: string[] = [];
    let calls = 0;
    const queue = new DebouncedSyncQueue(async () => {
      const response = value;
      calls += 1;
      if (calls === 1) await first.promise;
      return response;
    }, vi.fn(), 600, (response, isLatest) => { if (isLatest) applied.push(response); });
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    value = 'new';
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    first.resolve();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(applied).toEqual(['new']);
    queue.dispose();
  });

  it('retains failed work and retries it from the latest local state', async () => {
    let value = 'first';
    const statuses: string[] = [];
    const sync = vi.fn(async (_value: string) => undefined).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const queue = new DebouncedSyncQueue(async () => { await sync(value); }, (status) => statuses.push(status));
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    await Promise.resolve();
    expect(queue.hasPendingWork).toBe(true);
    expect(statuses).toContain('offline');
    value = 'latest';
    queue.retry();
    await vi.advanceTimersByTimeAsync(600);
    await Promise.resolve();
    expect(sync.mock.calls.map(([entry]) => entry)).toEqual(['first', 'latest']);
    expect(queue.hasPendingWork).toBe(false);
    queue.dispose();
  });

  it('retains both mistake entries after a failed sync and retries both', async () => {
    const entries = [{ id:'mistake-a' }, { id:'mistake-b' }];
    const writes: string[][] = [];
    const sync = vi.fn(async () => {
      writes.push(entries.map(({ id }) => id));
      if (writes.length === 1) throw new Error('offline');
    });
    const queue = new DebouncedSyncQueue(sync, vi.fn());
    queue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    expect(queue.hasPendingWork).toBe(true);
    expect(entries).toHaveLength(2);
    queue.retry();
    await vi.advanceTimersByTimeAsync(600);
    expect(writes).toEqual([['mistake-a','mistake-b'],['mistake-a','mistake-b']]);
    expect(queue.hasPendingWork).toBe(false);
    queue.dispose();
  });

  it('cancels an old account debounce on switch and keeps writes account-scoped', async () => {
    const writes: string[] = [];
    const oldQueue = new DebouncedSyncQueue(async () => { writes.push('account-A'); }, vi.fn());
    oldQueue.schedule();
    oldQueue.dispose();
    const newQueue = new DebouncedSyncQueue(async () => { writes.push('account-B'); }, vi.fn());
    newQueue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    await Promise.resolve();
    expect(writes).toEqual(['account-B']);
    newQueue.dispose();
  });

  it('does not publish an old account response after switching accounts', async () => {
    const oldRequest = deferred();
    const oldApplied: string[] = [];
    const oldQueue = new DebouncedSyncQueue(async () => { await oldRequest.promise; return 'account-A'; }, vi.fn(), 600, (result) => oldApplied.push(result));
    oldQueue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    oldQueue.dispose();

    const newApplied: string[] = [];
    const newQueue = new DebouncedSyncQueue(async () => 'account-B', vi.fn(), 600, (result) => newApplied.push(result));
    newQueue.schedule();
    await vi.advanceTimersByTimeAsync(600);
    oldRequest.resolve();
    await Promise.resolve();
    expect(oldApplied).toEqual([]);
    expect(newApplied).toEqual(['account-B']);
    newQueue.dispose();
  });
});
