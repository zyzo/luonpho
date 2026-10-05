import { createHash } from 'node:crypto';
import { z } from 'zod';

export const POLICY_VERSION = '1';
export const MAX_COMMENTS = 5;
export const MAX_FINDINGS = 12;

export const evidenceSchema = z.object({
  path: z.string().min(1).max(240),
  revision: z.enum(['head', 'base']),
  line: z.number().int().positive(),
  excerpt: z.string().min(1).max(500),
});

export const findingSchema = z.object({
  kind: z.enum(['issue', 'performance_hypothesis', 'alternative']),
  category: z.enum([
    'correctness',
    'usability',
    'performance',
    'threejs',
    'architecture',
    'gameplay',
  ]),
  severity: z.enum(['P1', 'P2', 'P3']),
  confidence: z.enum(['high', 'medium', 'low']),
  path: z.string().min(1).max(240).nullable(),
  line: z.number().int().positive().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  title: z.string().min(1).max(120),
  impact: z.string().min(1).max(1000),
  introducedByChange: z.string().min(1).max(1000),
  evidence: z.array(evidenceSchema).min(1).max(4),
  recommendation: z.string().min(1).max(1000),
  alternatives: z.string().max(1000),
  verification: z.string().min(1).max(1000),
});

export const reportSchema = z.object({
  summary: z.string().min(1).max(2000),
  limitations: z.array(z.string().min(1).max(500)).max(12),
  findings: z.array(findingSchema).max(MAX_FINDINGS),
});

// Application-added coverage notes can exceed the model's twelve-note limit.
export const persistedReportSchema = reportSchema.extend({
  limitations: z.array(z.string().min(1).max(500)).max(200),
});

export type Finding = z.infer<typeof findingSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Revision = 'head' | 'base';

export function fingerprint(finding: Finding) {
  // Exclude line numbers: a nearby insertion should not duplicate an open finding.
  return createHash('sha256')
    .update(
      JSON.stringify([
        finding.kind,
        finding.category,
        finding.path,
        finding.title.toLowerCase().replace(/\s+/g, ' ').trim(),
        finding.evidence.map((item) => [item.path, item.excerpt.trim()]),
      ]),
    )
    .digest('hex')
    .slice(0, 24);
}

export function reviewMarker(head: string, targetBase: string) {
  return `<!-- chucongan:review:${POLICY_VERSION}:${head}:${targetBase} -->`;
}

export function findingMarker(finding: Finding) {
  return `<!-- chucongan:finding:${fingerprint(finding)} -->`;
}
