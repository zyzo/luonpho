export interface ContextManifest {
  repository: string;
  baseSha: string;
  headSha: string;
  mergeBaseSha: string;
  coverageGaps: string[];
}

/** Pinned, read-only PR context is implemented in issue #2. */
export const collectContext = async (): Promise<never> => {
  throw new Error('PR context collection is not implemented yet');
};
