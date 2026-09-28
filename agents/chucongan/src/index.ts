import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { loadConfig } from './config.js';
import { PostgresQueueStore } from './database.js';
import { GitHubAppClient } from './github.js';
import { GitHubWebhookHandler, isValidSignature } from './webhooks/github.js';

const maxWebhookBytes = 1_000_000;

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxWebhookBytes) throw new Error('Webhook body is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const respond = (
  response: ServerResponse,
  status: number,
  body: string,
): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: body }));
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const store = new PostgresQueueStore(config.databaseUrl);
  await store.migrate();
  const handler = new GitHubWebhookHandler(
    store,
    {
      secret: config.webhookSecret,
      debounceMs: config.debounceMs,
      installationId: config.installationId,
      repository: config.repository,
    },
    new GitHubAppClient(config.githubAppId, config.githubAppPrivateKey),
  );
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health')
      return respond(response, 200, 'ok');
    if (request.method !== 'POST' || request.url !== '/webhooks/github')
      return respond(response, 404, 'not found');
    try {
      const body = await readBody(request);
      const signature = request.headers['x-hub-signature-256'];
      const signatureValue = Array.isArray(signature)
        ? signature[0]
        : signature;
      if (!isValidSignature(body, signatureValue, config.webhookSecret))
        return respond(response, 401, 'invalid signature');
      const deliveryHeader = request.headers['x-github-delivery'];
      const eventHeader = request.headers['x-github-event'];
      const deliveryId = Array.isArray(deliveryHeader)
        ? deliveryHeader[0]
        : deliveryHeader;
      const eventName = Array.isArray(eventHeader)
        ? eventHeader[0]
        : eventHeader;
      if (!deliveryId || !eventName)
        return respond(response, 400, 'missing GitHub delivery headers');
      const result = await handler.handle(
        deliveryId,
        eventName,
        JSON.parse(body.toString('utf8')),
      );
      return respond(response, 202, result);
    } catch (error) {
      console.error(
        'Webhook processing failed',
        error instanceof Error ? error.message : 'unknown error',
      );
      return respond(response, 400, 'invalid webhook');
    }
  });
  server.listen(config.port, () =>
    console.log(`chucongan listening on port ${config.port}`),
  );
};

void main();
