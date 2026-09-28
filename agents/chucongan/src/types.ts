export type ReviewTrigger = 'pull_request' | 'comment';

export interface ReviewJob {
  id: number;
  pullNumber: number;
  headSha: string;
  trigger: ReviewTrigger;
  attempts: number;
}

export interface ReviewRequest {
  pullNumber: number;
  headSha: string;
  trigger: ReviewTrigger;
}

export interface QueueStore {
  recordDelivery(deliveryId: string, eventName: string): Promise<boolean>;
  enqueue(request: ReviewRequest, debounceMs: number): Promise<void>;
  leaseNext(leaseMs: number): Promise<ReviewJob | undefined>;
  complete(jobId: number): Promise<void>;
  supersede(jobId: number): Promise<void>;
  fail(jobId: number): Promise<void>;
  recoverExpiredLeases(): Promise<number>;
  isSuperseded(job: ReviewJob): Promise<boolean>;
}

export interface PullRequestPayload {
  action: string;
  installation?: { id: number };
  repository?: { id: number; full_name: string };
  pull_request?: { number: number; draft: boolean; head: { sha: string } };
  sender?: { login: string; association: string };
  issue?: { number: number; pull_request?: unknown };
  comment?: { body: string };
}
