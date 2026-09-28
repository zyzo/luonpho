import { createSign } from 'node:crypto';
import type { PullRequestHeadResolver } from './webhooks/github.js';

const githubApi = 'https://api.github.com';

const base64Url = (value: string | Buffer): string =>
  Buffer.from(value).toString('base64url');

export class GitHubAppClient implements PullRequestHeadResolver {
  constructor(
    private readonly appId: number,
    private readonly privateKey: string,
  ) {}

  async resolve(
    repository: string,
    pullNumber: number,
    installationId: number,
  ): Promise<string | undefined> {
    const token = await this.installationToken(installationId);
    const response = await fetch(
      `${githubApi}/repos/${repository}/pulls/${pullNumber}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as { head?: { sha?: string } };
    return body.head?.sha;
  }

  private async installationToken(installationId: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(
      JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: this.appId }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const jwt = `${header}.${payload}.${signer.sign(this.privateKey).toString('base64url')}`;
    const response = await fetch(
      `${githubApi}/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
        },
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub installation token request failed: ${response.status}`,
      );
    const body = (await response.json()) as { token?: string };
    if (!body.token)
      throw new Error(
        'GitHub installation token response did not include a token',
      );
    return body.token;
  }
}
