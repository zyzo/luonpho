import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

test('real HTTP server verifies signatures, ignores irrelevant events and releases its lock', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'chucongan-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = join(directory, 'key.pem');
  await writeFile(
    keyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const secret = 'test-only-webhook-secret-'.repeat(3);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      PATH: process.env.PATH,
      OPENAI_API_KEY: 'test-only-not-a-real-key',
      OPENAI_MODEL: 'test-model',
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
      GITHUB_WEBHOOK_SECRET: secret,
      CHUCONGAN_STATE_DIR: join(directory, 'state'),
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${url}/health`)).status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Server may still be starting. */
    }
    await setTimeout(20);
  }
  assert.ok(ready, 'server did not start');
  assert.equal(
    (await fetch(`${url}/webhooks`, { method: 'POST', body: '{}' })).status,
    401,
  );
  const signature = `sha256=${createHmac('sha256', secret).update('{}').digest('hex')}`;
  const response = await fetch(`${url}/webhooks`, {
    method: 'POST',
    body: '{}',
    headers: {
      'x-hub-signature-256': signature,
      'x-github-delivery': 'test-delivery',
      'x-github-event': 'ping',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ignored');
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
  await assert.rejects(readFile(join(directory, 'state', 'server.lock')), {
    code: 'ENOENT',
  });
});
