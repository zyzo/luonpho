import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { validSignature, selectJob, type JobRequest } from '../src/webhook.ts';
import { Queue, type Job } from '../src/queue.ts';
import { Store } from '../src/store.ts';

const payload = {
  action: 'opened',
  repository: { full_name: 'zyzo/luonpho' },
  installation: { id: 1 },
  sender: { login: 'author', type: 'User' },
  pull_request: { number: 2, draft: false, head: { sha: 'a'.repeat(40) } },
};
const request: JobRequest = {
  target: { owner: 'zyzo', repo: 'luonpho', pull_number: 2 },
  installationId: 1,
  head: 'a'.repeat(40),
};

async function storeFor(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'chucongan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new Store(directory);
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await setTimeout(5);
  }
  throw new Error('Timed out waiting for queue');
}

test('webhook signatures require exact authenticated bytes and a valid digest', () => {
  const body = Buffer.from('{"hello":"world"}');
  const secret = 'high entropy secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(validSignature(body, signature, secret), true);
  assert.equal(
    validSignature(Buffer.from('different'), signature, secret),
    false,
  );
  for (const bad of [
    undefined,
    'sha1=abc',
    'sha256=abc',
    `sha256=${'z'.repeat(64)}`,
  ]) {
    assert.equal(validSignature(body, bad, secret), false);
  }
});

test('event selection restricts repositories, drafts and event actions', () => {
  assert.equal(
    selectJob('pull_request', payload, 'zyzo/luonpho')?.target.pull_number,
    2,
  );
  assert.equal(selectJob('pull_request', payload, 'elsewhere/repo'), undefined);
  assert.equal(
    selectJob('pull_request', { ...payload, action: 'closed' }, 'zyzo/luonpho'),
    undefined,
  );
  assert.equal(
    selectJob(
      'pull_request',
      { ...payload, pull_request: { ...payload.pull_request, draft: true } },
      'zyzo/luonpho',
    ),
    undefined,
  );
  assert.equal(selectJob('pull_request', {}, 'zyzo/luonpho'), undefined);
});

test('manual requests require the exact command on a PR from a non-bot collaborator', () => {
  const manual = {
    ...payload,
    action: 'created',
    issue: { number: 2, pull_request: { url: 'ignored' } },
    comment: { body: '/chucongan review', author_association: 'COLLABORATOR' },
  };
  assert.equal(
    selectJob('issue_comment', manual, 'zyzo/luonpho')?.manualActor,
    'author',
  );
  for (const changed of [
    {
      ...manual,
      comment: { ...manual.comment, body: 'please /chucongan review' },
    },
    { ...manual, comment: { ...manual.comment, author_association: 'NONE' } },
    { ...manual, sender: { login: 'bot', type: 'Bot' } },
    { ...manual, issue: { number: 2 } },
  ])
    assert.equal(
      selectJob('issue_comment', changed, 'zyzo/luonpho'),
      undefined,
    );
});

test('state writes are private, atomic and independent of untrusted filenames', async (t) => {
  const store = await storeFor(t);
  await store.put('../../escape', { value: 1 });
  assert.deepEqual(await store.get('../../escape'), { value: 1 });
  assert.equal((await stat(store.path('../../escape'))).mode & 0o777, 0o600);
  assert.equal((await store.values()).length, 1);
  assert.equal(await store.get('missing'), undefined);
});

test('duplicate deliveries and duplicate queued heads do not spawn extra reviews', async (t) => {
  const store = await storeFor(t);
  let calls = 0;
  let finish!: () => void;
  const queue = new Queue(store, async () => {
    calls++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  t.after(async () => {
    finish?.();
    await queue.stop();
    await queue.idle();
  });
  assert.equal(await queue.enqueue('one', request), 'queued');
  await until(() => calls === 1);
  assert.equal(await queue.enqueue('one', request), 'duplicate');
  assert.equal(await queue.enqueue('two', request), 'duplicate-head');
  finish();
  await queue.idle();
  assert.equal(calls, 1);
});

test('new heads abort superseded work but never run two publishers for one PR', async (t) => {
  const store = await storeFor(t);
  let active = 0;
  let maximum = 0;
  const started: string[] = [];
  const queue = new Queue(store, async (job, signal) => {
    active++;
    maximum = Math.max(maximum, active);
    started.push(job.id);
    try {
      if (job.id === 'old')
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      return { status: 'published' };
    } finally {
      active--;
    }
  });
  await queue.enqueue('old', request);
  await until(() => started.length === 1);
  await queue.enqueue('new', { ...request, head: 'b'.repeat(40) });
  await queue.idle();
  assert.deepEqual(started, ['old', 'new']);
  assert.equal(maximum, 1);
  assert.equal((await store.get<Job>('job:old'))?.status, 'cancelled');
  assert.equal((await store.get<Job>('job:new'))?.status, 'completed');
  await queue.stop();
});

test('daily admission limits are persisted and failed deliveries can be reconciled', async (t) => {
  const store = await storeFor(t);
  let calls = 0;
  const queue = new Queue(
    store,
    async () => {
      calls++;
      throw new Error('upstream');
    },
    2,
  );
  await queue.enqueue('one', request);
  await queue.idle();
  await queue.enqueue('one', request);
  await queue.idle();
  await assert.rejects(queue.enqueue('three', request), /Daily review/);
  assert.equal(calls, 2);
  await queue.stop();
});

test('restart recovers unfinished jobs; shutdown keeps interrupted work queued', async (t) => {
  const store = await storeFor(t);
  await store.put('job:recover', {
    ...request,
    kind: 'job',
    id: 'recover',
    createdAt: new Date().toISOString(),
    status: 'running',
  } satisfies Job);
  const queue = new Queue(store, async (_job, signal) => {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('stop')), {
        once: true,
      }),
    );
  });
  await queue.recover('zyzo/luonpho');
  await setTimeout(20);
  await queue.stop();
  await queue.idle();
  assert.equal((await store.get<Job>('job:recover'))?.status, 'queued');
  let calls = 0;
  const restarted = new Queue(store, async () => {
    calls++;
    return {};
  });
  await restarted.recover('zyzo/luonpho');
  await restarted.idle();
  assert.equal(calls, 1);
  assert.equal((await store.get<Job>('job:recover'))?.status, 'completed');
  await restarted.stop();
});
