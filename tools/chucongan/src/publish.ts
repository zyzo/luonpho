import { hasAnchor } from './diff.ts';
import type { GitHub, Snapshot, SourceReader } from './github.ts';
import {
  MAX_COMMENTS,
  findingMarker,
  fingerprint,
  reviewMarker,
  type Finding,
  type Report,
} from './schema.ts';

export function safeText(text: string) {
  // Only our own hidden markers may enter published Markdown. Suppress mentions.
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '@\u200b');
}

export async function validateEvidence(
  report: Report,
  reader: Pick<SourceReader, 'file'>,
): Promise<Report> {
  const findings: Finding[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const finding of report.findings) {
    let valid = true;
    for (const evidence of finding.evidence) {
      try {
        const source = await reader.file(evidence.path, evidence.revision);
        const line = source.split('\n')[evidence.line - 1];
        if (
          !line ||
          !line.includes(evidence.excerpt) ||
          !evidence.excerpt.trim()
        )
          valid = false;
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      rejected.push(
        'A candidate finding was removed because its exact source evidence could not be validated.',
      );
      continue;
    }
    const id = fingerprint(finding);
    if (seen.has(id)) continue;
    seen.add(id);
    findings.push(finding);
  }
  return {
    ...report,
    summary: rejected.length
      ? `${findings.length} finding(s) survived exact source-evidence validation. This bounded static review is not an approval.`
      : report.summary,
    findings,
    limitations: [...report.limitations, ...new Set(rejected)],
  };
}

export function renderFinding(finding: Finding) {
  const label =
    finding.kind === 'issue'
      ? finding.severity
      : finding.kind === 'performance_hypothesis'
        ? 'Hypothesis · non-blocking'
        : 'Optional';
  const evidence = finding.evidence
    .map(
      (item) =>
        `- ${safeText(item.path)}:${item.line} (${item.revision}): ${safeText(item.excerpt)}`,
    )
    .join('\n');
  return [
    `**[${label} · ${finding.category}] ${safeText(finding.title)}**`,
    safeText(finding.impact),
    `**Introduced/worsened by:** ${safeText(finding.introducedByChange)}`,
    `**Recommendation:** ${safeText(finding.recommendation)}`,
    finding.alternatives
      ? `**Trade-offs / alternatives:** ${safeText(finding.alternatives)}`
      : '',
    `**Verify:** ${safeText(finding.verification)}`,
    `**Source evidence:**\n${evidence}`,
    findingMarker(finding),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function publication(
  snapshot: Snapshot,
  report: Report,
  openMarkers = new Set<string>(),
) {
  const comments: {
    path: string;
    line: number;
    side: 'LEFT' | 'RIGHT';
    body: string;
  }[] = [];
  const summary: Finding[] = [];
  let duplicates = 0;
  const priority = { P1: 1, P2: 2, P3: 3 };
  const ordered = [...report.findings].sort(
    (a, b) => priority[a.severity] - priority[b.severity],
  );
  for (const finding of ordered) {
    if (openMarkers.has(findingMarker(finding))) {
      duplicates++;
      continue;
    }
    const inline =
      finding.kind === 'issue' &&
      finding.confidence === 'high' &&
      hasAnchor(snapshot.files, finding.path, finding.line, finding.side) &&
      comments.length < MAX_COMMENTS;
    if (inline) {
      comments.push({
        path: finding.path!,
        line: finding.line!,
        side: finding.side,
        body: renderFinding(finding),
      });
    } else {
      summary.push(finding);
    }
  }
  const limitations = [
    ...new Set([...snapshot.limitations, ...report.limitations]),
  ];
  const body = [
    '## chucongan — advisory review',
    `Reviewed commit: \`${snapshot.head}\`. No approval or change request is implied.`,
    safeText(report.summary),
    `${comments.length} inline finding(s); ${duplicates} existing open finding(s) not repeated.`,
    summary.length ? '### Non-inline findings and optional alternatives' : '',
    ...summary.slice(0, 6).map(renderFinding),
    summary.length > 6
      ? `${summary.length - 6} additional finding(s) omitted from this bounded summary; see the stored report.`
      : '',
    '### Coverage and limitations',
    ...limitations.slice(0, 20).map((text) => `- ${safeText(text)}`),
    limitations.length > 20
      ? '- Additional coverage gaps are recorded in the stored report.'
      : '',
    reviewMarker(snapshot.head, snapshot.targetBase),
  ]
    .filter(Boolean)
    .join('\n\n');
  if (
    body.length > 60_000 ||
    comments.some((comment) => comment.body.length > 60_000)
  ) {
    throw new Error('Published Markdown exceeds safe GitHub size limit');
  }
  return { body, comments };
}

export type Publisher = Pick<
  GitHub,
  | 'botLogin'
  | 'reviews'
  | 'assertCurrent'
  | 'openFindingMarkers'
  | 'createReview'
>;

export async function existingReview(
  github: Pick<GitHub, 'reviews' | 'botLogin'>,
  snapshot: Pick<Snapshot, 'target' | 'head' | 'targetBase'>,
) {
  const marker = reviewMarker(snapshot.head, snapshot.targetBase);
  return (await github.reviews(snapshot.target)).find(
    (review) =>
      review.user?.login === github.botLogin &&
      review.commit_id === snapshot.head &&
      review.state !== 'PENDING' &&
      review.state !== 'DISMISSED' &&
      review.body?.includes(marker),
  );
}

export async function publish(
  github: Publisher,
  snapshot: Snapshot,
  report: Report,
) {
  // Reconcile first: createReview is intentionally NEVER retried blindly.
  const previous = await existingReview(github, snapshot);
  if (previous) return { id: previous.id, reused: true };
  const openMarkers = await github.openFindingMarkers(snapshot.target);
  const payload = publication(snapshot, report, openMarkers);
  await github.assertCurrent(
    snapshot.target,
    snapshot.head,
    snapshot.targetBase,
  );
  const review = await github.createReview(
    snapshot.target,
    snapshot.head,
    payload.body,
    payload.comments,
  );
  return { id: review.id, reused: false };
}
