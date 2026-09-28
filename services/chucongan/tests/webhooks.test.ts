import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  GitHubWebhookHandler,
  isValidSignature,
  type PullRequestHeadResolver,
} from '../src/webhooks/github.js';
import type { QueueStore, ReviewJob, ReviewRequest } from '../src/types.js';

class TestStore implements QueueStore {
  deliveries = new Set<string>();
  requests: ReviewRequest[] = [];

  async recordDelivery(deliveryId: string): Promise<boolean> {
    if (this.deliveries.has(deliveryId)) return false;
    this.deliveries.add(deliveryId);
    return true;
  }
  async enqueue(request: ReviewRequest): Promise<void> {
    this.requests.push(request);
  }
  async leaseNext(): Promise<ReviewJob | undefined> {
    return undefined;
  }
  async complete(): Promise<void> {}
  async supersede(): Promise<void> {}
  async fail(): Promise<void> {}
  async recoverExpiredLeases(): Promise<number> {
    return 0;
  }
  async isSuperseded(): Promise<boolean> {
    return false;
  }
}

const resolver: PullRequestHeadResolver = { resolve: async () => 'head-sha' };

test('deduplicates a valid pull-request webhook delivery', async () => {
  const store = new TestStore();
  const handler = new GitHubWebhookHandler(
    store,
    { secret: 'secret', debounceMs: 0, repository: 'zyzo/luonpho' },
    resolver,
  );
  const payload = {
    action: 'opened',
    number: 1,
    installation: { id: 5 },
    repository: { id: 8, full_name: 'zyzo/luonpho' },
    pull_request: { number: 1, draft: false, head: { sha: 'abc' } },
  };
  assert.equal(
    await handler.handle('delivery-1', 'pull_request', payload),
    'queued',
  );
  assert.equal(
    await handler.handle('delivery-1', 'pull_request', payload),
    'ignored',
  );
  assert.deepEqual(store.requests, [
    { pullNumber: 1, headSha: 'abc', trigger: 'pull_request' },
  ]);
});

test('queues an authorized explicit review command', async () => {
  const store = new TestStore();
  const handler = new GitHubWebhookHandler(
    store,
    { secret: 'secret', debounceMs: 0 },
    resolver,
  );
  const payload = {
    action: 'created',
    installation: { id: 5 },
    repository: { id: 8, full_name: 'zyzo/luonpho' },
    issue: { number: 4, pull_request: {} },
    comment: { body: '/chucongan review' },
    sender: { login: 'maintainer', association: 'MEMBER' },
  };
  assert.equal(
    await handler.handle('delivery-2', 'issue_comment', payload),
    'queued',
  );
  assert.equal(store.requests[0]?.headSha, 'head-sha');

  payload.sender.association = 'CONTRIBUTOR';
  assert.equal(
    await handler.handle('delivery-3', 'issue_comment', payload),
    'ignored',
  );
});

test('accepts only a timing-safe SHA-256 GitHub signature', () => {
  const body = Buffer.from('{"ok":true}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(isValidSignature(body, signature, 'secret'), true);
  assert.equal(isValidSignature(body, 'sha256=wrong', 'secret'), false);
});
