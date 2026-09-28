import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import type { QueueStore, ReviewJob, ReviewRequest } from './types.js';

const migrationsDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

export class PostgresQueueStore implements QueueStore {
  readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
      const applied = await this.pool.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (applied.rowCount) continue;
      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
      await this.transaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          name,
        ]);
      });
    }
  }

  async recordDelivery(
    deliveryId: string,
    eventName: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      'INSERT INTO webhook_deliveries (delivery_id, event_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [deliveryId, eventName],
    );
    return result.rowCount === 1;
  }

  async enqueue(request: ReviewRequest, debounceMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO review_jobs (pull_number, head_sha, trigger, not_before)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 millisecond'))
       ON CONFLICT (pull_number) WHERE status = 'queued'
       DO UPDATE SET head_sha = EXCLUDED.head_sha, trigger = EXCLUDED.trigger,
                     not_before = EXCLUDED.not_before, updated_at = now()`,
      [request.pullNumber, request.headSha, request.trigger, debounceMs],
    );
  }

  async leaseNext(leaseMs: number): Promise<ReviewJob | undefined> {
    const result = await this.pool.query(
      `WITH candidate AS (
         SELECT id FROM review_jobs queued
         WHERE status = 'queued' AND not_before <= now()
           AND NOT EXISTS (
             SELECT 1 FROM review_jobs leased
             WHERE leased.pull_number = queued.pull_number AND leased.status = 'leased'
           )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE review_jobs job
       SET status = 'leased', attempts = attempts + 1,
           lease_expires_at = now() + ($1 * interval '1 millisecond'), updated_at = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id, job.pull_number, job.head_sha, job.trigger, job.attempts`,
      [leaseMs],
    );
    const row = result.rows[0];
    return (
      row && {
        id: row.id,
        pullNumber: row.pull_number,
        headSha: row.head_sha,
        trigger: row.trigger,
        attempts: row.attempts,
      }
    );
  }

  async complete(jobId: number): Promise<void> {
    await this.pool.query(
      "UPDATE review_jobs SET status = 'completed', completed_at = now(), lease_expires_at = NULL, updated_at = now() WHERE id = $1 AND status = 'leased'",
      [jobId],
    );
  }

  async supersede(jobId: number): Promise<void> {
    await this.pool.query(
      "UPDATE review_jobs SET status = 'superseded', lease_expires_at = NULL, updated_at = now() WHERE id = $1 AND status = 'leased'",
      [jobId],
    );
  }

  async fail(jobId: number): Promise<void> {
    await this.pool.query(
      "UPDATE review_jobs SET status = 'failed', lease_expires_at = NULL, updated_at = now() WHERE id = $1 AND status = 'leased'",
      [jobId],
    );
  }

  async recoverExpiredLeases(): Promise<number> {
    const result = await this.pool.query(
      "UPDATE review_jobs SET status = 'queued', lease_expires_at = NULL, not_before = now(), updated_at = now() WHERE status = 'leased' AND lease_expires_at < now()",
    );
    return result.rowCount ?? 0;
  }

  async isSuperseded(job: ReviewJob): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM review_jobs WHERE pull_number = $1 AND status = 'queued' LIMIT 1",
      [job.pullNumber],
    );
    return result.rowCount === 1;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
