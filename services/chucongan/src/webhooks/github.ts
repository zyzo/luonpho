import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  QueueStore,
  PullRequestPayload,
  ReviewRequest,
} from '../types.js';

const reviewCommand = /^\/chucongan\s+review\s*$/i;
const authorizedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export interface WebhookPolicy {
  secret: string;
  debounceMs: number;
  installationId?: number;
  repository?: string;
}

export interface PullRequestHeadResolver {
  resolve(
    repository: string,
    pullNumber: number,
    installationId: number,
  ): Promise<string | undefined>;
}

export const isValidSignature = (
  body: Buffer,
  signature: string | undefined,
  secret: string,
): boolean => {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    received.length === expectedBuffer.length &&
    timingSafeEqual(received, expectedBuffer)
  );
};

export class GitHubWebhookHandler {
  constructor(
    private readonly store: QueueStore,
    private readonly policy: WebhookPolicy,
    private readonly headResolver: PullRequestHeadResolver,
  ) {}

  async handle(
    deliveryId: string,
    eventName: string,
    payload: PullRequestPayload,
  ): Promise<'ignored' | 'queued'> {
    if (!(await this.store.recordDelivery(deliveryId, eventName)))
      return 'ignored';
    const request = await this.reviewRequest(eventName, payload);
    if (!request) return 'ignored';
    await this.store.enqueue(request, this.policy.debounceMs);
    return 'queued';
  }

  private async reviewRequest(
    eventName: string,
    payload: PullRequestPayload,
  ): Promise<ReviewRequest | undefined> {
    const repository = payload.repository;
    const installationId = payload.installation?.id;
    if (
      !repository ||
      !installationId ||
      !this.isExpectedTarget(repository.full_name, installationId)
    )
      return undefined;

    if (eventName === 'pull_request') {
      const pullRequest = payload.pull_request;
      const number = (payload as PullRequestPayload & { number?: number })
        .number;
      if (!pullRequest || !number || pullRequest.draft) return undefined;
      if (
        !['opened', 'ready_for_review', 'synchronize'].includes(payload.action)
      )
        return undefined;
      return this.request(number, pullRequest.head.sha, 'pull_request');
    }

    if (
      eventName === 'issue_comment' &&
      payload.action === 'created' &&
      payload.issue?.pull_request &&
      payload.comment
    ) {
      if (
        !reviewCommand.test(payload.comment.body) ||
        !authorizedAssociations.has(payload.sender?.association ?? '')
      )
        return undefined;
      const headSha = await this.headResolver.resolve(
        repository.full_name,
        payload.issue.number,
        installationId,
      );
      if (!headSha) return undefined;
      return this.request(payload.issue.number, headSha, 'comment');
    }
    return undefined;
  }

  private request(
    pullNumber: number,
    headSha: string,
    trigger: ReviewRequest['trigger'],
  ): ReviewRequest {
    return {
      pullNumber,
      headSha,
      trigger,
    };
  }

  private isExpectedTarget(
    repository: string,
    installationId: number,
  ): boolean {
    return (
      (!this.policy.repository || this.policy.repository === repository) &&
      (!this.policy.installationId ||
        this.policy.installationId === installationId)
    );
  }
}
