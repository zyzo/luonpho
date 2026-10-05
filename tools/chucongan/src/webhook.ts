import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { target } from './config.ts';
import type { Target } from './github.ts';

export function validSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

const payloadSchema = z.object({
  action: z.string().optional(),
  changes: z.object({ base: z.unknown().optional() }).optional(),
  repository: z.object({ full_name: z.string() }),
  installation: z.object({ id: z.number().int().positive().safe() }),
  sender: z.object({ login: z.string(), type: z.string() }),
  pull_request: z
    .object({
      number: z.number().int().positive().safe(),
      draft: z.boolean().optional(),
      head: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }),
    })
    .optional(),
  issue: z
    .object({
      number: z.number().int().positive().safe(),
      pull_request: z.object({ url: z.string() }).optional(),
    })
    .optional(),
  comment: z
    .object({
      body: z.string(),
      author_association: z.string(),
    })
    .optional(),
});

export interface JobRequest {
  target: Target;
  installationId: number;
  head?: string;
  targetBase?: string;
  manualActor?: string;
}

export function selectJob(
  event: string,
  payload: unknown,
  allowedRepository: string,
): JobRequest | undefined {
  if (event !== 'pull_request' && event !== 'issue_comment') return undefined;
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  const data = parsed.data;
  if (
    data.repository.full_name.toLowerCase() !== allowedRepository.toLowerCase()
  )
    return undefined;
  if (event === 'pull_request') {
    const baseEdited =
      data.action === 'edited' && data.changes?.base !== undefined;
    if (
      !baseEdited &&
      !['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(
        data.action ?? '',
      )
    )
      return undefined;
    if (!data.pull_request || data.pull_request.draft) return undefined;
    return {
      target: target(
        data.repository.full_name,
        String(data.pull_request.number),
      ),
      installationId: data.installation.id,
      head: data.pull_request.head.sha,
    };
  }
  if (
    data.action !== 'created' ||
    !data.issue?.pull_request ||
    !data.comment ||
    data.sender.type === 'Bot'
  )
    return undefined;
  if (data.comment.body.trim() !== '/chucongan review') return undefined;
  if (
    !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(
      data.comment.author_association,
    )
  )
    return undefined;
  return {
    target: target(data.repository.full_name, String(data.issue.number)),
    installationId: data.installation.id,
    manualActor: data.sender.login,
  };
}
