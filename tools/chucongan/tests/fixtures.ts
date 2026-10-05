import type { Finding, Report } from '../src/schema.ts';
import type { Snapshot } from '../src/github.ts';

export const snapshot: Snapshot = {
  target: { owner: 'zyzo', repo: 'luonpho', pull_number: 1 },
  head: 'a'.repeat(40),
  base: 'b'.repeat(40),
  targetBase: 'c'.repeat(40),
  title: 'Change renderer',
  body: '',
  files: [
    {
      filename: 'src/world.ts',
      status: 'modified',
      patch:
        '@@ -1,2 +1,2 @@\n-const old = 1;\n+const changed = 2;\n const shared = 3;',
    },
  ],
  paths: ['src/world.ts'],
  limitations: ['Static review only; no measured performance evidence.'],
  checks: [],
  existingComments: [],
};

export const finding: Finding = {
  kind: 'issue',
  category: 'correctness',
  severity: 'P2',
  confidence: 'high',
  path: 'src/world.ts',
  line: 1,
  side: 'RIGHT',
  title: 'Preserve required initialization',
  impact: 'Starting the ride uses an invalid initial state.',
  introducedByChange: 'The PR replaces the initial value used by the ride.',
  evidence: [
    {
      path: 'src/world.ts',
      revision: 'head',
      line: 1,
      excerpt: 'const changed = 2;',
    },
  ],
  recommendation: 'Restore the valid starting state.',
  alternatives: '',
  verification: 'Add a regression test covering ride initialization.',
};

export function report(findings: Finding[] = [finding]): Report {
  return {
    summary: 'Review found a candidate issue.',
    limitations: [],
    findings,
  };
}
