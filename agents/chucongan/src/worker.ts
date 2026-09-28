import type { QueueStore, ReviewJob } from './types.js';

export type ReviewExecutor = (job: ReviewJob) => Promise<void>;

export class ReviewWorker {
  constructor(
    private readonly store: QueueStore,
    private readonly execute: ReviewExecutor,
    private readonly leaseMs: number,
  ) {}

  async recover(): Promise<number> {
    return this.store.recoverExpiredLeases();
  }

  async processOne(): Promise<boolean> {
    const job = await this.store.leaseNext(this.leaseMs);
    if (!job) return false;
    if (await this.store.isSuperseded(job)) {
      await this.store.supersede(job.id);
      return true;
    }
    try {
      await this.execute(job);
      await this.store.complete(job.id);
    } catch {
      await this.store.fail(job.id);
      throw new Error(`Review job ${job.id} failed`);
    }
    return true;
  }
}
