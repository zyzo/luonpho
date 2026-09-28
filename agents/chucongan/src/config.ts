const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
};

const optionalNumber = (name: string): number | undefined => {
  const value = process.env[name];
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error(`${name} must be an integer`);
  return number;
};

export interface Config {
  databaseUrl: string;
  webhookSecret: string;
  port: number;
  debounceMs: number;
  leaseMs: number;
  githubAppId: number;
  githubAppPrivateKey: string;
  installationId?: number;
  repository?: string;
}

export const loadConfig = (): Config => ({
  databaseUrl: required('DATABASE_URL'),
  webhookSecret: required('GITHUB_WEBHOOK_SECRET'),
  port: optionalNumber('PORT') ?? 3000,
  debounceMs: optionalNumber('REVIEW_DEBOUNCE_MS') ?? 30_000,
  leaseMs: optionalNumber('JOB_LEASE_MS') ?? 5 * 60_000,
  githubAppId: Number(required('GITHUB_APP_ID')),
  githubAppPrivateKey: required('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
  installationId: optionalNumber('GITHUB_INSTALLATION_ID'),
  repository: process.env.GITHUB_REPOSITORY,
});
