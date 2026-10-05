import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Octokit } from '@octokit/rest';
import type { Response } from 'openai/resources/responses/responses';
import { GitHub } from '../src/github.ts';
import { review } from '../src/review.ts';
import { Store } from '../src/store.ts';
import { reviewMarker } from '../src/schema.ts';
import { report, snapshot } from './fixtures.ts';

function fixture(failWrite = false, writeSucceeded = false) {
  let modelCalls = 0;
  let writes = 0;
  let published = false;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const path = url.pathname;
    let result: unknown;
    if (path.endsWith('/pulls/1'))
      result = {
        state: 'open',
        draft: false,
        head: { sha: snapshot.head },
        base: { sha: snapshot.targetBase },
        title: 'Change',
        body: '',
        changed_files: 1,
      };
    else if (path.endsWith('/reviews')) {
      // Octokit provides the HTTP method through request init.
      throw new Error('method needed');
    } else if (path.includes('/compare/'))
      result = { merge_base_commit: { sha: snapshot.base } };
    else if (path.endsWith('/files')) result = snapshot.files;
    else if (path.includes('/git/trees/'))
      result = {
        tree: [
          {
            type: 'blob',
            path: 'src/world.ts',
            sha: 'd'.repeat(40),
            mode: '100644',
          },
        ],
      };
    else if (path.includes('/git/blobs/'))
      result = {
        encoding: 'base64',
        size: 18,
        content: Buffer.from('const changed = 2;').toString('base64'),
      };
    else if (path.endsWith('/check-runs'))
      result = { total_count: 0, check_runs: [] };
    else if (path.endsWith('/comments')) result = [];
    else if (path === '/graphql')
      result = {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
            },
          },
        },
      };
    else throw new Error(`Unexpected URL ${url}`);
    return new globalThis.Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const routed: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.pathname.endsWith('/reviews')) {
      let result: unknown;
      if (init?.method === 'POST') {
        writes++;
        if (failWrite && writes === 1) {
          published = writeSucceeded;
          throw new Error('ambiguous transport failure');
        }
        published = true;
        result = { id: 99 };
      } else {
        result = published
          ? [
              {
                id: 99,
                user: { login: 'chucongan[bot]' },
                commit_id: snapshot.head,
                state: 'COMMENTED',
                body: reviewMarker(snapshot.head, snapshot.targetBase),
              },
            ]
          : [];
      }
      return new globalThis.Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return fetcher(input, init);
  };
  return {
    github: new GitHub(
      new Octokit({ request: { fetch: routed } }),
      'chucongan[bot]',
    ),
    responder: {
      create: async () => {
        modelCalls++;
        return {
          status: 'completed',
          output: [],
          output_text: JSON.stringify(report()),
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Response;
      },
    },
    counts: () => ({ modelCalls, writes }),
  };
}

async function storeFor(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'chucongan-pipeline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new Store(directory);
}

test('end-to-end dry-run stores a validated report without posting', async (t) => {
  const store = await storeFor(t);
  const setup = fixture();
  const result = await review(setup.github, snapshot.target, {
    model: 'test',
    publish: false,
    signal: AbortSignal.timeout(2000),
    responder: setup.responder,
    store,
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.report?.findings.length, 1);
  assert.ok(
    result.report?.limitations.some((text) => text.includes('Static review')),
  );
  assert.deepEqual(setup.counts(), { modelCalls: 2, writes: 0 });
  assert.equal((await store.values()).length, 1);
});

test('a failed publication reuses persisted evidence without another OpenAI call', async (t) => {
  const store = await storeFor(t);
  const setup = fixture(true);
  const options = {
    model: 'test',
    publish: true,
    signal: AbortSignal.timeout(2000),
    responder: setup.responder,
    store,
  };
  await assert.rejects(review(setup.github, snapshot.target, options));
  assert.deepEqual(setup.counts(), { modelCalls: 2, writes: 1 });
  const result = await review(setup.github, snapshot.target, options);
  assert.equal(result.status, 'published');
  assert.equal(result.cached, true);
  assert.deepEqual(setup.counts(), { modelCalls: 2, writes: 2 });
});

test('an ambiguous successful publication is reconciled without reposting or rebilling', async (t) => {
  const store = await storeFor(t);
  const setup = fixture(true, true);
  const options = {
    model: 'test',
    publish: true,
    signal: AbortSignal.timeout(2000),
    responder: setup.responder,
    store,
  };
  await assert.rejects(review(setup.github, snapshot.target, options));
  const result = await review(setup.github, snapshot.target, options);
  assert.equal(result.status, 'already-reviewed');
  assert.equal(result.reviewId, 99);
  assert.deepEqual(setup.counts(), { modelCalls: 2, writes: 1 });
});
