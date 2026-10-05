import { setTimeout } from 'node:timers/promises';
import type { JobRequest } from './webhook.ts';
import { Store } from './store.ts';

export interface Job extends JobRequest {
  kind: 'job';
  id: string;
  createdAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
}

type Worker = (job: Job, signal: AbortSignal) => Promise<unknown>;

function key(job: JobRequest) {
  return `${job.target.owner.toLowerCase()}/${job.target.repo.toLowerCase()}:${job.target.pull_number}`;
}

export class Queue {
  private readonly pending = new Map<string, Job>();
  private readonly active = new Map<
    string,
    { job: Job; controller: AbortController }
  >();
  private accepting: Promise<unknown> = Promise.resolve();
  private stopped = false;

  constructor(
    readonly store: Store,
    readonly worker: Worker,
    readonly dailyLimit = 50,
    readonly concurrency = 2,
  ) {}

  async recover(allowedRepository: string) {
    const records = await this.store.values<Job | { kind: 'budget' }>();
    const jobs = records
      .filter((record): record is Job => record.kind === 'job')
      .filter((job) => ['queued', 'running'].includes(job.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const job of jobs) {
      const repository = `${job.target.owner}/${job.target.repo}`;
      if (repository.toLowerCase() !== allowedRepository.toLowerCase()) {
        await this.save({
          ...job,
          status: 'cancelled',
          error: 'Repository no longer allowed',
        });
        continue;
      }
      const previous = this.pending.get(key(job));
      if (previous)
        await this.save({
          ...previous,
          status: 'cancelled',
          error: 'Superseded during recovery',
        });
      const queued: Job = { ...job, status: 'queued' };
      await this.save(queued);
      this.pending.set(key(job), queued);
    }
    this.drain();
  }

  enqueue(id: string, request: JobRequest): Promise<string> {
    // Serialize admission so concurrent deliveries cannot race the ledger/claim.
    const operation = this.accepting.then(() => this.admit(id, request));
    this.accepting = operation.catch(() => undefined);
    return operation;
  }

  private async admit(id: string, request: JobRequest) {
    if (this.stopped) throw new Error('Queue is shutting down');
    const previousDelivery = await this.store.get<Job>(`job:${id}`);
    if (previousDelivery && previousDelivery.status !== 'failed')
      return 'duplicate';
    const targetKey = key(request);
    const previous =
      this.pending.get(targetKey) ?? this.active.get(targetKey)?.job;
    if (
      request.head &&
      previous?.head === request.head &&
      previous.targetBase === request.targetBase
    )
      return 'duplicate-head';
    if (!this.pending.has(targetKey) && this.pending.size >= 20)
      throw new Error('Queue is full');
    const day = new Date().toISOString().slice(0, 10);
    const budget = await this.store.get<{ kind: 'budget'; count: number }>(
      `budget:${day}`,
    );
    const count = budget?.count ?? 0;
    if (count >= this.dailyLimit)
      throw new Error('Daily review admission limit reached');
    await this.store.put(`budget:${day}`, { kind: 'budget', count: count + 1 });
    const job: Job = {
      ...request,
      kind: 'job',
      id,
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    await this.save(job);
    const pending = this.pending.get(targetKey);
    if (pending)
      await this.save({
        ...pending,
        status: 'cancelled',
        error: 'Superseded by newer delivery',
      });
    this.pending.set(targetKey, job);
    this.active
      .get(targetKey)
      ?.controller.abort(new Error('Superseded by newer delivery'));
    this.drain();
    return 'queued';
  }

  private save(job: Job) {
    return this.store.put(`job:${job.id}`, job);
  }

  private drain() {
    if (this.stopped) return;
    for (const [targetKey, job] of this.pending) {
      if (this.active.size >= this.concurrency) break;
      if (this.active.has(targetKey)) continue;
      this.pending.delete(targetKey);
      const controller = new AbortController();
      this.active.set(targetKey, { job, controller });
      void this.run(targetKey, job, controller).catch(() => {
        console.error(
          `chucongan: unable to persist job ${job.id}; recover from state after restart`,
        );
      });
    }
  }

  private async run(targetKey: string, job: Job, controller: AbortController) {
    try {
      await this.save({ ...job, status: 'running' });
      const result = await this.worker(job, controller.signal);
      await this.save({ ...job, status: 'completed', result });
      console.log(`chucongan: job ${job.id} completed`);
    } catch {
      const status = this.stopped
        ? 'queued'
        : controller.signal.aborted
          ? 'cancelled'
          : 'failed';
      // Do not log raw SDK errors, PR contents, credentials or model output.
      await this.save({
        ...job,
        status,
        error:
          status === 'cancelled'
            ? 'Job cancelled'
            : 'Review failed; retry delivery to reconcile or inspect provider logs',
      });
      console.error(`chucongan: job ${job.id} ${status}`);
    } finally {
      this.active.delete(targetKey);
      this.drain();
    }
  }

  async idle() {
    while (this.active.size) await setTimeout(10);
  }

  async stop() {
    this.stopped = true;
    await this.accepting;
    for (const { controller } of this.active.values()) controller.abort();
  }
}
