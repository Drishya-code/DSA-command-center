export type SyncQueueStatus = 'syncing' | 'synced' | 'offline';

/** Debounces local mutations while allowing only one network synchronization at a time. */
export class DebouncedSyncQueue<T = void> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private pending = false;
  private disposed = false;
  private generation = 0;

  constructor(
    private readonly syncLatest: () => Promise<T>,
    private readonly onStatus: (status: SyncQueueStatus, error?: unknown) => void,
    private readonly delayMs = 600,
    private readonly onSuccess?: (result: T, isLatest: boolean) => void,
  ) {}

  get hasPendingWork() { return this.pending || this.running; }

  schedule() {
    if (this.disposed) return;
    this.generation += 1;
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.delayMs);
  }

  retry() {
    if (this.pending || this.running) this.schedule();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain() {
    if (this.disposed || this.running || !this.pending) return;
    this.running = true;
    const generationAtStart = this.generation;
    let succeeded = false;
    this.onStatus('syncing');
    try {
      // Clear before calling sync so changes during an in-flight request mark pending again.
      this.pending = false;
      const result = await this.syncLatest();
      if (this.disposed) return;
      this.onSuccess?.(result, this.generation === generationAtStart);
      succeeded = true;
      this.onStatus(this.pending ? 'syncing' : 'synced');
    } catch (error) {
      if (this.disposed) return;
      this.pending = true;
      this.onStatus('offline', error);
    } finally {
      this.running = false;
      // A timer that expired during the request could not start another worker.
      // Run the now-debounced latest state without dropping that pending work.
      if (!this.disposed && this.pending && !this.timer && (succeeded || this.generation > generationAtStart)) {
        void this.drain();
      }
    }
  }
}
