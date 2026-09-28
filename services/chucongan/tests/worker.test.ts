import assert from 'node:assert/strict';
import test from 'node:test';
import { ReviewWorker } from '../src/worker.js';
import type { QueueStore, ReviewJob, ReviewRequest } from '../src/types.js';

class InterruptedLeaseStore implements QueueStore {
  recovered = false;
  leased = false;
  completed = false;
  private readonly job: ReviewJob = {
    id: 1,
    pullNumber: 2,
    headSha: 'abc',
    trigger: 'pull_request',
    attempts: 1,
  };

  async recordDelivery(): Promise<boolean> {
    return true;
  }
  async enqueue(_request: ReviewRequest): Promise<void> {}
  async leaseNext(): Promise<ReviewJob | undefined> {
    if (!this.recovered || this.leased) return undefined;
    this.leased = true;
    return this.job;
  }
  async complete(): Promise<void> {
    this.completed = true;
  }
  async supersede(): Promise<void> {}
  async fail(): Promise<void> {}
  async recoverExpiredLeases(): Promise<number> {
    this.recovered = true;
    return 1;
  }
  async isSuperseded(): Promise<boolean> {
    return false;
  }
}

test('recovers an interrupted lease and processes it once', async () => {
  const store = new InterruptedLeaseStore();
  const worker = new ReviewWorker(store, async () => {}, 1_000);
  assert.equal(await worker.recover(), 1);
  assert.equal(await worker.processOne(), true);
  assert.equal(store.completed, true);
  assert.equal(await worker.processOne(), false);
});
