import { readFile } from 'node:fs/promises';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { GitHub, type Target } from './github.ts';

export function required(name: string, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

export function integer(
  value: string,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!/^\d+$/.test(value))
    throw new Error(`${label} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${label} must be between 1 and ${maximum}`);
  }
  return number;
}

export function target(repository: string, number: string): Target {
  const parts = repository.split('/');
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(parts[0]) ||
    !/^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/.test(parts[1])
  ) {
    throw new Error('Repository must be owner/name');
  }
  return {
    owner: parts[0],
    repo: parts[1],
    pull_number: integer(number, 'PR number'),
  };
}

export async function appFactory(env = process.env) {
  const appId = integer(required('GITHUB_APP_ID', env), 'GitHub App ID');
  const privateKey = await readFile(
    required('GITHUB_APP_PRIVATE_KEY_PATH', env),
    'utf8',
  );
  const botLogin = env.CHUCONGAN_BOT_LOGIN?.trim() || 'chucongan[bot]';
  return async (
    installationId: number,
    repositoryName: string,
    signal: AbortSignal,
  ) => {
    const request = new Octokit({ request: { signal, timeout: 10_000 } })
      .request;
    const auth = createAppAuth({ appId, privateKey, request });
    const token = await auth({
      type: 'installation',
      installationId,
      repositoryNames: [repositoryName],
      permissions: { contents: 'read', pull_requests: 'write', checks: 'read' },
    });
    return new GitHub(
      new Octokit({
        auth: token.token,
        request: { signal, timeout: 15_000 },
      }),
      botLogin,
    );
  };
}
