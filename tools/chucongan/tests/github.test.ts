import test from 'node:test';
import assert from 'node:assert/strict';
import { Octokit } from '@octokit/rest';
import { GitHub, SourceReader } from '../src/github.ts';
import { findingMarker } from '../src/schema.ts';
import { finding, snapshot } from './fixtures.ts';

function github(handle: (url: URL, body: string) => unknown) {
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    return new Response(JSON.stringify(handle(url, String(init?.body ?? ''))), {
      headers: { 'content-type': 'application/json' },
    });
  };
  return new GitHub(
    new Octokit({ request: { fetch: fetcher } }),
    'chucongan[bot]',
  );
}

test('source reads use immutable SHAs and cache exact files', async () => {
  const requested: string[] = [];
  const gateway = github((url) => {
    if (url.pathname.includes('/git/trees/')) {
      requested.push(url.pathname.split('/').at(-1)!);
      return {
        tree: [
          {
            type: 'blob',
            path: 'src/world.ts',
            sha: 'd'.repeat(40),
            mode: '100644',
          },
        ],
      };
    }
    return {
      encoding: 'base64',
      size: 20,
      content: Buffer.from('const changed = 2;').toString('base64'),
    };
  });
  const reader = new SourceReader(gateway, snapshot);
  await reader.file('src/world.ts', 'head');
  await reader.file('src/world.ts', 'head');
  await reader.file('src/world.ts', 'base');
  assert.deepEqual(requested, [snapshot.head, snapshot.base]);
  const read = await reader.read('src/world.ts', 'head', 1, 1);
  assert.equal(read.content, '1: const changed = 2;');
});

test('source reader refuses symlinks, binary files, oversized files and disallowed paths', async () => {
  let calls = 0;
  const gateway = github(() => {
    calls++;
    return {
      tree: [
        {
          type: 'blob',
          path: 'src/world.ts',
          sha: 'd'.repeat(40),
          mode: '120000',
        },
      ],
    };
  });
  const reader = new SourceReader(gateway, snapshot);
  await assert.rejects(reader.file('.env', 'head'), /allowlist/);
  assert.equal(calls, 0);
  await assert.rejects(reader.file('src/world.ts', 'head'), /ordinary text/);
  const ordinary = (blob: unknown) =>
    github((url) =>
      url.pathname.includes('/git/trees/')
        ? {
            tree: [
              {
                type: 'blob',
                path: 'src/world.ts',
                sha: 'd'.repeat(40),
                mode: '100644',
              },
            ],
          }
        : blob,
    );
  await assert.rejects(
    new SourceReader(
      ordinary({ encoding: 'base64', size: 200_000, content: '' }),
      snapshot,
    ).file('src/world.ts', 'head'),
    /size limit/,
  );
  await assert.rejects(
    new SourceReader(
      ordinary({ encoding: 'base64', size: 1, content: 'AA==' }),
      snapshot,
    ).file('src/world.ts', 'head'),
    /Binary/,
  );
});

test('freshness guards reject head/base movement, drafts and closed PRs', async () => {
  const pull = {
    state: 'open',
    draft: false,
    head: { sha: snapshot.head },
    base: { sha: snapshot.targetBase },
  };
  await github(() => pull).assertCurrent(
    snapshot.target,
    snapshot.head,
    snapshot.targetBase,
  );
  for (const changed of [
    { ...pull, state: 'closed' },
    { ...pull, draft: true },
    { ...pull, head: { sha: 'd'.repeat(40) } },
    { ...pull, base: { sha: 'd'.repeat(40) } },
  ])
    await assert.rejects(
      github(() => changed).assertCurrent(
        snapshot.target,
        snapshot.head,
        snapshot.targetBase,
      ),
      /refusing stale/,
    );
});

test('deduplication ignores resolved/outdated/human threads and handles GraphQL bot logins', async () => {
  const thread = {
    isResolved: false,
    isOutdated: false,
    comments: {
      nodes: [{ body: findingMarker(finding), author: { login: 'chucongan' } }],
    },
  };
  const gateway = github(() => ({
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              thread,
              { ...thread, isResolved: true },
              { ...thread, isOutdated: true },
              {
                ...thread,
                comments: {
                  nodes: [{ body: 'spoofed', author: { login: 'human' } }],
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  }));
  const markers = await gateway.openFindingMarkers(snapshot.target);
  assert.deepEqual([...markers], [findingMarker(finding)]);
});

test('GitHub publication always uses COMMENT, explicit SHA and line/side coordinates', async () => {
  let posted: Record<string, unknown> = {};
  const gateway = github((_url, body) => {
    posted = JSON.parse(body);
    return { id: 1 };
  });
  await gateway.createReview(snapshot.target, snapshot.head, 'Advisory', [
    { path: 'src/world.ts', line: 1, side: 'RIGHT', body: 'Finding' },
  ]);
  assert.equal(posted.event, 'COMMENT');
  assert.equal(posted.commit_id, snapshot.head);
  assert.deepEqual(posted.comments, [
    { path: 'src/world.ts', line: 1, side: 'RIGHT', body: 'Finding' },
  ]);
});

test('snapshot uses merge-base source, records missing patches and checks final freshness', async () => {
  let pulls = 0;
  const gateway = github((url) => {
    const path = url.pathname;
    if (path.endsWith('/pulls/1')) {
      pulls++;
      return {
        state: 'open',
        draft: false,
        head: { sha: snapshot.head },
        base: { sha: snapshot.targetBase },
        title: 'Title',
        body: '',
        changed_files: 2,
      };
    }
    if (path.includes('/compare/'))
      return { merge_base_commit: { sha: snapshot.base } };
    if (path.endsWith('/files'))
      return [
        {
          filename: 'src/world.ts',
          status: 'modified',
          patch: snapshot.files[0].patch,
        },
        { filename: 'src/audio.ts', status: 'modified' },
      ];
    if (path.includes('/git/trees/'))
      return {
        tree: [{ type: 'blob', path: 'src/world.ts' }],
        truncated: false,
      };
    if (path.endsWith('/check-runs')) return { total_count: 0, check_runs: [] };
    if (path.endsWith('/comments')) return [];
    throw new Error(`Unexpected URL ${url}`);
  });
  const result = await gateway.snapshot(snapshot.target);
  assert.equal(result.base, snapshot.base);
  assert.equal(result.targetBase, snapshot.targetBase);
  assert.ok(result.limitations.some((text) => text.includes('src/audio.ts')));
  assert.equal(pulls, 2);
});
