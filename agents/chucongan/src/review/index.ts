export interface ReviewReport {
  baseSha: string;
  headSha: string;
  findings: unknown[];
  coverage: string[];
}

/** Responses API integration is implemented in issue #3. */
export const reviewContext = async (): Promise<never> => {
  throw new Error('Responses review is not implemented yet');
};
