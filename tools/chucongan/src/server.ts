import { mkdir, open, unlink } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { openAIResponder } from './agent.ts';
import { appFactory, integer, required, target } from './config.ts';
import { Queue } from './queue.ts';
import { review } from './review.ts';
import { Store } from './store.ts';
import { selectJob, validSignature } from './webhook.ts';

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_000_000) throw new Error('Webhook body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const model = required('OPENAI_MODEL');
  const responder = openAIResponder(required('OPENAI_API_KEY'));
  const secret = required('GITHUB_WEBHOOK_SECRET');
  if (secret.length < 32)
    throw new Error('Use a webhook secret of at least 32 characters');
  const repository = process.env.CHUCONGAN_REPOSITORY || 'zyzo/luonpho';
  target(repository, '1');
  const factory = await appFactory();
  const port = integer(process.env.PORT || '8787', 'Port', 65535);
  const dailyLimit = integer(
    process.env.CHUCONGAN_DAILY_LIMIT || '50',
    'Daily review limit',
    1000,
  );
  const directory = resolve(process.env.CHUCONGAN_STATE_DIR || '.chucongan');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(directory, 'server.lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(() => {
    throw new Error(
      'State directory locked. Run only one server; after a crash verify the old process stopped before deleting server.lock.',
    );
  });
  await lock.writeFile(String(process.pid));
  const queue = new Queue(
    new Store(resolve(directory, 'jobs')),
    async (job, cancellation) => {
      const signal = AbortSignal.any([
        cancellation,
        AbortSignal.timeout(180_000),
      ]);
      const github = await factory(job.installationId, job.target.repo, signal);
      if (job.manualActor) {
        const { data } =
          await github.client.rest.repos.getCollaboratorPermissionLevel({
            owner: job.target.owner,
            repo: job.target.repo,
            username: job.manualActor,
          });
        if (!['admin', 'maintain', 'write'].includes(data.permission)) {
          throw new Error('Manual review requires repository write permission');
        }
      }
      // An older delayed webhook may arrive after a newer head was already queued.
      const pull = await github.pull(job.target);
      if (job.head && job.head !== pull.head.sha)
        return { status: 'superseded' };
      if (pull.draft || pull.state !== 'open') return { status: 'skipped' };
      return review(github, job.target, {
        model,
        publish: true,
        signal,
        responder,
        store: new Store(resolve(directory, 'reviews')),
      });
    },
    dailyLimit,
  );

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200).end('ok');
        return;
      }
      if (request.method !== 'POST' || request.url !== '/webhooks') {
        response.writeHead(404).end();
        return;
      }
      const raw = await body(request);
      const signature = request.headers['x-hub-signature-256'];
      if (
        !validSignature(
          raw,
          typeof signature === 'string' ? signature : undefined,
          secret,
        )
      ) {
        response.writeHead(401).end('invalid signature');
        return;
      }
      const delivery = request.headers['x-github-delivery'];
      const event = request.headers['x-github-event'];
      if (
        typeof delivery !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(delivery) ||
        typeof event !== 'string'
      ) {
        response.writeHead(400).end('invalid headers');
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        response.writeHead(400).end('invalid JSON');
        return;
      }
      const job = selectJob(event, payload, repository);
      if (!job) {
        response.writeHead(200).end('ignored');
        return;
      }
      const admission = await factory(
        job.installationId,
        job.target.repo,
        AbortSignal.timeout(8000),
      );
      const current = await admission.pull(job.target);
      // Validate freshness BEFORE a delivery can cancel work for the current head.
      if (
        current.draft ||
        current.state !== 'open' ||
        (job.head && job.head !== current.head.sha)
      ) {
        response.writeHead(200).end('superseded or skipped');
        return;
      }
      job.head = current.head.sha;
      job.targetBase = current.base.sha;
      const status = await queue.enqueue(delivery, job);
      response.writeHead(202).end(status);
    })().catch(() => {
      if (!response.headersSent)
        response.writeHead(503).end('unavailable; retry later');
      else response.end();
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;
  try {
    await queue.recover(repository);
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(port, process.env.HOST || '127.0.0.1', accept);
    });
  } catch (error) {
    await queue.stop();
    await queue.idle();
    await lock.close();
    await unlink(lockPath);
    throw error;
  }
  console.log(`chucongan: listening on ${port}, repository ${repository}`);
  const stop = async () => {
    await queue.stop();
    await new Promise<void>((accept) => server.close(() => accept()));
    // Do not release the single-instance lock while a publisher is still active.
    await queue.idle();
    await lock.close();
    await unlink(lockPath);
  };
  let stopping = false;
  for (const event of ['SIGINT', 'SIGTERM'] as const) {
    process.once(event, () => {
      if (stopping) return;
      stopping = true;
      void stop().catch(() => {
        process.exitCode = 1;
      });
    });
  }
}

main().catch(() => {
  console.error(
    'chucongan: server startup failed. Check required environment variables, state lock, and App credentials.',
  );
  process.exitCode = 1;
});
