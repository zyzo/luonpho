import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'openai/resources/responses/responses';
import { analyze } from '../src/agent.ts';
import { existingReview, type Publisher } from '../src/publish.ts';
import { reviewMarker } from '../src/schema.ts';
import { selectJob } from '../src/webhook.ts';
import { snapshot, report } from './fixtures.ts';

const reader = {
  read: async () => ({
    path: 'src/world.ts',
    revision: 'head' as const,
    totalLines: 1,
    content: '1: code',
    note: '',
  }),
  search: async () => ({ matches: [], unreadable: [], note: '' }),
};

test('stateless tool continuation preserves encrypted reasoning', async () => {
  let calls = 0;
  await analyze(
    {
      create: async (request) => {
        calls++;
        assert.deepEqual(request.include, ['reasoning.encrypted_content']);
        if (calls === 1)
          return {
            status: 'completed',
            output_text: '',
            output: [
              {
                type: 'reasoning',
                id: 'reasoning_1',
                summary: [],
                encrypted_content: 'opaque-encrypted-reasoning',
              },
              {
                type: 'function_call',
                name: 'search_code',
                arguments: '{"query":"renderer"}',
                call_id: 'call_1',
              },
            ],
          } as Response;
        if (calls === 2)
          assert.match(
            JSON.stringify(request.input),
            /opaque-encrypted-reasoning/,
          );
        return {
          status: 'completed',
          output: [],
          output_text: JSON.stringify(report([])),
        } as unknown as Response;
      },
    },
    reader,
    snapshot,
    'test',
    AbortSignal.timeout(1000),
  );
  assert.equal(calls, 3);
});

test('the verifier cannot promote an unmeasured hypothesis into an inline defect', async () => {
  let calls = 0;
  const result = await analyze(
    {
      create: async () => {
        calls++;
        const value = report();
        if (calls === 1)
          value.findings[0] = {
            ...value.findings[0],
            kind: 'performance_hypothesis',
          };
        return {
          status: 'completed',
          output: [],
          output_text: JSON.stringify(value),
        } as unknown as Response;
      },
    },
    reader,
    snapshot,
    'test',
    AbortSignal.timeout(1000),
  );
  assert.equal(result.report.findings.length, 0);
});

test('a review of another base SHA cannot suppress review of this snapshot', async () => {
  const reviews = [
    {
      id: 1,
      user: { login: 'chucongan[bot]' },
      commit_id: snapshot.head,
      state: 'COMMENTED',
      body: reviewMarker(snapshot.head, 'd'.repeat(40)),
    },
  ] as Awaited<ReturnType<Publisher['reviews']>>;
  assert.equal(
    await existingReview(
      { botLogin: 'chucongan[bot]', reviews: async () => reviews },
      snapshot,
    ),
    undefined,
  );
});

test('editing the base triggers review while title/body edits do not', () => {
  const payload = {
    action: 'edited',
    repository: { full_name: 'zyzo/luonpho' },
    installation: { id: 1 },
    sender: { login: 'author', type: 'User' },
    pull_request: { number: 1, head: { sha: snapshot.head } },
  };
  assert.equal(selectJob('pull_request', payload, 'zyzo/luonpho'), undefined);
  assert.ok(
    selectJob(
      'pull_request',
      { ...payload, changes: { base: { ref: { from: 'old-base' } } } },
      'zyzo/luonpho',
    ),
  );
});
