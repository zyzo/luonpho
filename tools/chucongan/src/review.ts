import { analyze, type AgentResult, type Responder } from './agent.ts';
import { GitHub, SourceReader, type Target } from './github.ts';
import { existingReview, publish, validateEvidence } from './publish.ts';
import {
  POLICY_VERSION,
  persistedReportSchema,
  type Report,
} from './schema.ts';
import { Store } from './store.ts';

export interface ReviewOptions {
  model: string;
  publish: boolean;
  includeDraft?: boolean;
  signal: AbortSignal;
  responder: Responder;
  store: Store;
}

export interface ReviewResult {
  status: 'already-reviewed' | 'dry-run' | 'published';
  head: string;
  reviewId?: number;
  model?: string;
  cached?: boolean;
  artifact?: string;
  report?: Report;
  usage?: AgentResult['usage'];
}

export async function review(
  github: GitHub,
  target: Target,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const { model, signal, responder, store } = options;
  signal.throwIfAborted();
  if (options.publish) {
    const pull = await github.pull(target);
    const previous = await existingReview(github, {
      target,
      head: pull.head.sha,
      targetBase: pull.base.sha,
    });
    if (previous)
      return {
        status: 'already-reviewed',
        head: pull.head.sha,
        reviewId: previous.id,
      };
  }
  const snapshot = await github.snapshot(target, options.includeDraft);
  const reader = new SourceReader(github, snapshot);
  const key = `review:${target.owner}/${target.repo}:${target.pull_number}:${snapshot.head}:${snapshot.targetBase}:${model}:${POLICY_VERSION}`;
  const cached = await store.get<AgentResult>(key);
  const analyzed = cached
    ? {
        usage: cached.usage,
        report: persistedReportSchema.parse(cached.report),
      }
    : await analyze(responder, reader, snapshot, model, signal);
  const report = await validateEvidence(analyzed.report, reader);
  report.limitations = [
    ...new Set([...snapshot.limitations, ...report.limitations]),
  ];
  const prepared = { ...analyzed, report };
  // Persist before the write so an ambiguous network failure can reuse the report.
  await store.put(key, {
    head: snapshot.head,
    base: snapshot.base,
    targetBase: snapshot.targetBase,
    model,
    policyVersion: POLICY_VERSION,
    ...prepared,
  });
  signal.throwIfAborted();
  await github.assertCurrent(
    target,
    snapshot.head,
    snapshot.targetBase,
    options.includeDraft,
  );
  if (!options.publish) {
    return {
      status: 'dry-run',
      head: snapshot.head,
      model,
      cached: Boolean(cached),
      artifact: store.path(key),
      ...prepared,
    };
  }
  const published = await publish(github, snapshot, report);
  return {
    status: published.reused ? 'already-reviewed' : 'published',
    head: snapshot.head,
    model,
    cached: Boolean(cached),
    reviewId: published.id,
    artifact: store.path(key),
    ...prepared,
  };
}
