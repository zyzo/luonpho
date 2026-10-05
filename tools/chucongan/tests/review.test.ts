import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAnchor, isReviewablePath, parseAnchors } from '../src/diff.ts';
import { findingMarker, fingerprint, reportSchema } from '../src/schema.ts';
import {
  publication,
  publish,
  safeText,
  validateEvidence,
  type Publisher,
} from '../src/publish.ts';
import { target, integer } from '../src/config.ts';
import { finding, report, snapshot } from './fixtures.ts';

function publisher(overrides: Partial<Publisher> = {}): Publisher {
  return {
    botLogin: 'chucongan[bot]',
    reviews: async () => [],
    assertCurrent: async () => {},
    openFindingMarkers: async () => new Set(),
    createReview: async () =>
      ({ id: 42 }) as Awaited<ReturnType<Publisher['createReview']>>,
    ...overrides,
  };
}

test('diff parser handles additions, deletions, context, multiple hunks and newline markers', () => {
  const anchors = parseAnchors(
    '@@ -2,2 +4,3 @@\n same\n-old\n+new\n+extra\n\\ No newline at end of file\n@@ -10 +20 @@\n-before\n+after',
  );
  assert.deepEqual(anchors, [
    { side: 'LEFT', line: 2, changed: false },
    { side: 'RIGHT', line: 4, changed: false },
    { side: 'LEFT', line: 3, changed: true },
    { side: 'RIGHT', line: 5, changed: true },
    { side: 'RIGHT', line: 6, changed: true },
    { side: 'LEFT', line: 10, changed: true },
    { side: 'RIGHT', line: 20, changed: true },
  ]);
});

test('zero-length hunks and missing patches never fabricate anchors', () => {
  assert.deepEqual(parseAnchors('@@ -0,0 +1 @@\n+new'), [
    { side: 'RIGHT', line: 1, changed: true },
  ]);
  assert.deepEqual(parseAnchors('@@ -1 +0,0 @@\n-old'), [
    { side: 'LEFT', line: 1, changed: true },
  ]);
  assert.equal(
    hasAnchor([{ filename: 'x', status: 'modified' }], 'x', 1, 'RIGHT'),
    false,
  );
  assert.equal(hasAnchor(snapshot.files, 'src/world.ts', 99, 'RIGHT'), false);
});

test('source allowlist excludes traversal, secrets, skills and reviewer instructions', () => {
  for (const path of [
    '.env',
    'src/../.env',
    '../src/world.ts',
    '/src/world.ts',
    'src\\world.ts',
    'AGENTS.md',
    'tools/chucongan/src/policy.ts',
    '.agents/skills/skill.md',
    'key.pem',
  ]) {
    assert.equal(isReviewablePath(path), false, path);
  }
  assert.equal(isReviewablePath('src/world.ts'), true);
  assert.equal(isReviewablePath('package.json'), true);
});

test('strict report validation rejects unsupported kinds and excess findings', () => {
  assert.throws(() =>
    reportSchema.parse(
      report([{ ...finding, kind: 'measured_regression' } as never]),
    ),
  );
  assert.throws(() =>
    reportSchema.parse(report(Array.from({ length: 13 }, () => finding))),
  );
  assert.throws(() =>
    reportSchema.parse(report([{ ...finding, evidence: [] }])),
  );
});

test('fingerprints ignore line drift while preserving distinct source evidence', () => {
  assert.equal(
    fingerprint(finding),
    fingerprint({
      ...finding,
      line: 20,
      evidence: [{ ...finding.evidence[0], line: 20 }],
    }),
  );
  assert.notEqual(
    fingerprint(finding),
    fingerprint({
      ...finding,
      evidence: [{ ...finding.evidence[0], excerpt: 'different code' }],
    }),
  );
});

test('source evidence must match its exact line/revision; duplicate findings are removed', async () => {
  const result = await validateEvidence(
    report([
      finding,
      finding,
      {
        ...finding,
        title: 'Wrong line',
        evidence: [{ ...finding.evidence[0], line: 2 }],
      },
      {
        ...finding,
        title: 'Invented excerpt',
        evidence: [{ ...finding.evidence[0], excerpt: 'made up' }],
      },
    ]),
    { file: async () => 'const changed = 2;\nconst shared = 3;' },
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.limitations.length, 1);
});

test('unreadable evidence is rejected rather than assumed', async () => {
  const result = await validateEvidence(report(), {
    file: async () => {
      throw new Error('404');
    },
  });
  assert.equal(result.findings.length, 0);
  assert.ok(result.limitations.length);
});

test('only high-confidence, diff-anchored defects become inline comments', () => {
  const payload = publication(
    snapshot,
    report([
      finding,
      {
        ...finding,
        title: 'Potential bottleneck',
        kind: 'performance_hypothesis',
      },
      { ...finding, title: 'An alternative', kind: 'alternative' },
      { ...finding, title: 'Unknown location', line: 99 },
      { ...finding, title: 'Less certain', confidence: 'medium' },
    ]),
  );
  assert.equal(payload.comments.length, 1);
  assert.equal(payload.comments[0].line, 1);
  assert.match(payload.body, /Hypothesis · non-blocking/);
  assert.match(payload.body, /Optional/);
  assert.match(payload.body, /Unknown location/);
});

test('inline comments are capped at five; open findings are not repeated', () => {
  const findings = Array.from({ length: 7 }, (_, i) => ({
    ...finding,
    title: `Issue ${i}`,
  }));
  const payload = publication(
    snapshot,
    report(findings),
    new Set([findingMarker(findings[0])]),
  );
  assert.equal(payload.comments.length, 5);
  assert.match(payload.body, /1 existing open finding/);
  assert.match(payload.body, /Issue 6/);
});

test('untrusted Markdown cannot spoof bot markers or ping users', () => {
  const value = safeText('<!-- chucongan:review:1:abc --> @somebody <script>');
  assert.ok(!value.includes('<!--'));
  assert.ok(!value.includes('@somebody'));
  const payload = publication(
    snapshot,
    report([{ ...finding, impact: '<!-- malicious --> @owner' }]),
  );
  assert.ok(!payload.comments[0].body.includes('<!-- malicious -->'));
  assert.ok(payload.comments[0].body.includes(findingMarker(finding)));
});

test('publisher checks freshness immediately before a single advisory write', async () => {
  const operations: string[] = [];
  await publish(
    publisher({
      assertCurrent: async (_target, head, base) => {
        assert.equal(head, snapshot.head);
        assert.equal(base, snapshot.targetBase);
        operations.push('fresh');
      },
      createReview: async (_target, head, body, comments) => {
        operations.push('write');
        assert.equal(head, snapshot.head);
        assert.equal(comments.length, 1);
        assert.match(body, /advisory/);
        return { id: 42 } as Awaited<ReturnType<Publisher['createReview']>>;
      },
    }),
    snapshot,
    report(),
  );
  assert.deepEqual(operations, ['fresh', 'write']);
});

test('a stale PR cannot publish', async () => {
  let writes = 0;
  await assert.rejects(
    publish(
      publisher({
        assertCurrent: async () => {
          throw new Error('stale');
        },
        createReview: async () => {
          writes++;
          throw new Error('must not execute');
        },
      }),
      snapshot,
      report(),
    ),
    /stale/,
  );
  assert.equal(writes, 0);
});

test('an ambiguous GitHub write is not automatically retried', async () => {
  let writes = 0;
  await assert.rejects(
    publish(
      publisher({
        createReview: async () => {
          writes++;
          throw new Error('connection dropped');
        },
      }),
      snapshot,
      report(),
    ),
    /connection dropped/,
  );
  assert.equal(writes, 1);
});

test('existing bot review at this SHA is reused; human spoofing is ignored', async () => {
  const make = (login: string) =>
    [
      {
        id: 9,
        user: { login },
        commit_id: snapshot.head,
        state: 'COMMENTED',
        body: `<!-- chucongan:review:1:${snapshot.head}:${snapshot.targetBase} -->`,
      },
    ] as Awaited<ReturnType<Publisher['reviews']>>;
  let writes = 0;
  const result = await publish(
    publisher({
      reviews: async () => make('chucongan[bot]'),
      createReview: async () => {
        writes++;
        throw new Error('unexpected');
      },
    }),
    snapshot,
    report(),
  );
  assert.deepEqual(result, { id: 9, reused: true });
  assert.equal(writes, 0);
  const fresh = await publish(
    publisher({ reviews: async () => make('someone-else') }),
    snapshot,
    report(),
  );
  assert.equal(fresh.reused, false);
});

test('configuration rejects malformed repositories and numbers', () => {
  assert.deepEqual(target('zyzo/luonpho', '12'), {
    owner: 'zyzo',
    repo: 'luonpho',
    pull_number: 12,
  });
  for (const value of ['0', '-1', '1.2', 'Infinity', '9007199254740992'])
    assert.throws(() => integer(value, 'number'));
  for (const repo of [
    'zyzo',
    '../luonpho',
    'zyzo/luonpho/extra',
    'zyzo/luonpho?x',
  ])
    assert.throws(() => target(repo, '1'));
});
