import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  Response,
  ResponseOutputItem,
} from 'openai/resources/responses/responses';
import { analyze, type Responder } from '../src/agent.ts';
import { finding, report, snapshot } from './fixtures.ts';

const reader = {
  read: async () => ({
    path: 'src/world.ts',
    revision: 'head' as const,
    totalLines: 1,
    content: '1: const changed = 2;',
    note: '',
  }),
  search: async () => ({ matches: [], unreadable: [], note: 'limited' }),
};
function output(
  text: string,
  items: ResponseOutputItem[] = [],
  status = 'completed',
): Response {
  return {
    status,
    output_text: text,
    output: items,
    usage: { input_tokens: 100, output_tokens: 50 },
  } as Response;
}
function tool(name: string, args: unknown): ResponseOutputItem {
  return {
    type: 'function_call',
    name,
    arguments: JSON.stringify(args),
    call_id: 'call_1',
  };
}

test('Responses API uses strict schema, no stored responses and a separate challenge pass', async () => {
  let calls = 0;
  const responder: Responder = {
    create: async (request) => {
      calls++;
      assert.equal(request.store, false);
      assert.equal(request.parallel_tool_calls, false);
      assert.equal(request.max_output_tokens, 6000);
      assert.equal(request.text?.format?.type, 'json_schema');
      assert.match(request.instructions ?? '', /UNTRUSTED DATA/);
      if (calls === 1)
        return output('', [
          tool('read_file', {
            path: 'src/world.ts',
            revision: 'head',
            startLine: 1,
            limit: 20,
          }),
        ]);
      if (calls === 2) {
        assert.match(JSON.stringify(request.input), /function_call_output/);
        return output(JSON.stringify(report()));
      }
      assert.match(JSON.stringify(request.input), /DISPROVE/);
      return output(JSON.stringify(report()));
    },
  };
  const result = await analyze(
    responder,
    reader,
    snapshot,
    'test-model',
    AbortSignal.timeout(1000),
  );
  assert.equal(result.report.findings.length, 1);
  assert.deepEqual(result.usage, {
    requests: 3,
    toolCalls: 1,
    inputTokens: 300,
    outputTokens: 150,
  });
});

test('refused or incomplete output cannot become a review', async () => {
  await assert.rejects(
    analyze(
      { create: async () => output('', [], 'incomplete') },
      reader,
      snapshot,
      'test',
      AbortSignal.timeout(1000),
    ),
    /incomplete/,
  );
  await assert.rejects(
    analyze(
      { create: async () => output('not json') },
      reader,
      snapshot,
      'test',
      AbortSignal.timeout(1000),
    ),
  );
});

test('unknown tools are never executed and invalid arguments reveal no error details', async () => {
  let calls = 0;
  let reads = 0;
  const responder: Responder = {
    create: async (request) => {
      calls++;
      if (calls === 1)
        return output('', [tool('shell', { command: 'printenv' })]);
      if (calls === 2) {
        assert.match(JSON.stringify(request.input), /Unknown tool/);
        return output('', [
          tool('read_file', {
            path: '.env',
            revision: 'head',
            startLine: -1,
            limit: 1000,
          }),
        ]);
      }
      if (calls === 3)
        assert.match(JSON.stringify(request.input), /arguments invalid/);
      return output(JSON.stringify(report([])));
    },
  };
  await analyze(
    responder,
    {
      ...reader,
      read: async () => {
        reads++;
        throw new Error('secret error');
      },
    },
    snapshot,
    'test',
    AbortSignal.timeout(1000),
  );
  assert.equal(reads, 0);
});

test('the tool loop is bounded and finalization disables tool calls', async () => {
  let calls = 0;
  const responder: Responder = {
    create: async (request) => {
      calls++;
      if (calls === 4) {
        assert.equal(request.tool_choice, 'none');
        return output(JSON.stringify(report([])));
      }
      if (calls <= 3)
        return output('', [tool('search_code', { query: 'renderer' })]);
      return output(JSON.stringify(report([])));
    },
  };
  const result = await analyze(
    responder,
    reader,
    snapshot,
    'test',
    AbortSignal.timeout(1000),
  );
  assert.equal(calls, 5);
  assert.equal(result.usage.toolCalls, 3);
});

test('a verifier cannot add a new unchecked topic', async () => {
  let calls = 0;
  const result = await analyze(
    {
      create: async () => {
        calls++;
        return output(
          JSON.stringify(
            calls === 1
              ? report()
              : report([
                  finding,
                  { ...finding, category: 'gameplay', title: 'New topic' },
                ]),
          ),
        );
      },
    },
    reader,
    snapshot,
    'test',
    AbortSignal.timeout(1000),
  );
  assert.equal(result.report.findings.length, 1);
});

test('cancellation prevents further API requests', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(
    analyze(
      {
        create: async () => {
          requests++;
          return output(JSON.stringify(report()));
        },
      },
      reader,
      snapshot,
      'test',
      controller.signal,
    ),
  );
  assert.equal(requests, 0);
});
