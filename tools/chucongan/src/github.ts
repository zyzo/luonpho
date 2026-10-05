import { Octokit } from '@octokit/rest';
import { isReviewablePath, type ChangedFile } from './diff.ts';
import type { Revision } from './schema.ts';

export interface Target {
  owner: string;
  repo: string;
  pull_number: number;
}

export interface Snapshot {
  target: Target;
  head: string;
  base: string;
  targetBase: string;
  title: string;
  body: string;
  files: ChangedFile[];
  paths: string[];
  limitations: string[];
  checks: { name: string; status: string; conclusion: string | null }[];
  existingComments: { path: string; body: string }[];
}

const MAX_FILES = 100;
const MAX_PATCH_CHARS = 60_000;
const MAX_FILE_BYTES = 128_000;
const MAX_SOURCE_BYTES = 400_000;

export class GitHub {
  constructor(
    readonly client: Octokit,
    readonly botLogin: string,
  ) {}

  async pull(target: Target) {
    return (await this.client.rest.pulls.get({ ...target })).data;
  }

  async snapshot(target: Target, includeDraft = false): Promise<Snapshot> {
    const pull = await this.pull(target);
    if (pull.state !== 'open') throw new Error('PR is not open');
    if (pull.draft && !includeDraft)
      throw new Error('PR is a draft; review skipped');
    const limitations: string[] = [
      'Static review only: no PR code was executed and no browser/GPU performance measurements were taken.',
    ];
    const comparison = await this.client.rest.repos.compareCommits({
      owner: target.owner,
      repo: target.repo,
      base: pull.base.sha,
      head: pull.head.sha,
      per_page: 1,
    });
    const base = comparison.data.merge_base_commit.sha;
    const files: ChangedFile[] = [];
    let patchChars = 0;
    for await (const page of this.client.paginate.iterator(
      this.client.rest.pulls.listFiles,
      { ...target, per_page: 100 },
    )) {
      for (const file of page.data) {
        if (files.length === MAX_FILES) break;
        const patch = file.patch;
        const included = Boolean(
          patch &&
          isReviewablePath(file.filename) &&
          patchChars + patch.length <= MAX_PATCH_CHARS,
        );
        if (included) patchChars += patch!.length;
        if (isReviewablePath(file.filename) && !included) {
          limitations.push(
            `Diff unavailable or budget-excluded: ${file.filename}`,
          );
        }
        files.push({
          filename: file.filename,
          previous_filename: file.previous_filename,
          status: file.status,
          patch: included ? patch : undefined,
        });
      }
      if (files.length >= MAX_FILES) break;
    }
    if (pull.changed_files > files.length) {
      limitations.push(
        `Only ${files.length}/${pull.changed_files} changed files collected.`,
      );
    }
    const tree = await this.client.rest.git.getTree({
      owner: target.owner,
      repo: target.repo,
      tree_sha: pull.head.sha,
      recursive: '1',
    });
    if (tree.data.truncated)
      limitations.push('GitHub repository tree is truncated.');
    const paths = tree.data.tree
      .filter(
        (item) =>
          item.type === 'blob' && item.path && isReviewablePath(item.path),
      )
      .map((item) => item.path!)
      .slice(0, 500);
    if (paths.length === 500)
      limitations.push('Source path index limited to 500 files.');
    let checks: Snapshot['checks'] = [];
    try {
      const result = await this.client.rest.checks.listForRef({
        owner: target.owner,
        repo: target.repo,
        ref: pull.head.sha,
        per_page: 100,
      });
      checks = result.data.check_runs.map(({ name, status, conclusion }) => ({
        name,
        status,
        conclusion,
      }));
      if (result.data.total_count > checks.length)
        limitations.push('Check results are truncated.');
    } catch {
      limitations.push(
        'CI check results unavailable; no test success is assumed.',
      );
    }
    const comments = await this.comments(target);
    const existingComments = comments.slice(-30).map(({ path, body }) => ({
      path,
      body: body.slice(0, 1200),
    }));
    await this.assertCurrent(
      target,
      pull.head.sha,
      pull.base.sha,
      includeDraft,
    );
    return {
      target,
      head: pull.head.sha,
      base,
      targetBase: pull.base.sha,
      title: pull.title.slice(0, 500),
      body: (pull.body ?? '').slice(0, 6000),
      files,
      paths,
      limitations,
      checks,
      existingComments,
    };
  }

  async assertCurrent(
    target: Target,
    head: string,
    base?: string,
    includeDraft = false,
  ) {
    const pull = await this.pull(target);
    if (
      pull.state !== 'open' ||
      (!includeDraft && pull.draft) ||
      pull.head.sha !== head ||
      (base && pull.base.sha !== base)
    ) {
      throw new Error(
        'PR changed or closed during review; refusing stale publication',
      );
    }
  }

  async reviews(target: Target) {
    return this.client.paginate(this.client.rest.pulls.listReviews, {
      ...target,
      per_page: 100,
    });
  }

  async comments(target: Target) {
    return this.client.paginate(this.client.rest.pulls.listReviewComments, {
      ...target,
      per_page: 100,
    });
  }

  async openFindingMarkers(target: Target): Promise<Set<string>> {
    const markers = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: {
                isResolved: boolean;
                isOutdated: boolean;
                comments: {
                  nodes: { body: string; author: { login: string } | null }[];
                };
              }[];
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          };
        };
      } = await this.client.graphql(
        `
        query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $cursor) {
                nodes { isResolved isOutdated comments(first: 1) { nodes { body author { login } } } }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        {
          owner: target.owner,
          repo: target.repo,
          number: target.pull_number,
          cursor,
        },
      );
      const threads = data.repository.pullRequest.reviewThreads;
      for (const thread of threads.nodes) {
        const comment = thread.comments.nodes[0];
        if (
          thread.isResolved ||
          thread.isOutdated ||
          comment?.author?.login.replace(/\[bot\]$/, '') !==
            this.botLogin.replace(/\[bot\]$/, '')
        )
          continue;
        for (const match of comment.body.matchAll(
          /<!-- chucongan:finding:[a-f0-9]{24} -->/g,
        )) {
          markers.add(match[0]);
        }
      }
      if (!threads.pageInfo.hasNextPage) return markers;
      cursor = threads.pageInfo.endCursor;
    }
    throw new Error('Too many review threads to safely deduplicate');
  }

  async createReview(
    target: Target,
    head: string,
    body: string,
    comments: {
      path: string;
      line: number;
      side: 'LEFT' | 'RIGHT';
      body: string;
    }[],
  ) {
    return (
      await this.client.rest.pulls.createReview({
        ...target,
        commit_id: head,
        event: 'COMMENT',
        body,
        comments,
      })
    ).data;
  }
}

export class SourceReader {
  readonly cache = new Map<string, string>();
  private bytes = 0;
  private readonly trees = new Map<
    Revision,
    Map<string, { sha: string; mode: string }>
  >();

  constructor(
    readonly github: GitHub,
    readonly snapshot: Snapshot,
  ) {}

  async file(path: string, revision: Revision): Promise<string> {
    if (!isReviewablePath(path))
      throw new Error('Path is outside the source allowlist');
    const key = `${revision}:${path}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    if (this.bytes >= MAX_SOURCE_BYTES)
      throw new Error('Source read budget exhausted');
    // Read blobs directly: GitHub's Contents API can follow a symlink into a
    // disallowed path while reporting the result as an ordinary file.
    let tree = this.trees.get(revision);
    if (!tree) {
      const result = await this.github.client.rest.git.getTree({
        owner: this.snapshot.target.owner,
        repo: this.snapshot.target.repo,
        tree_sha: revision === 'head' ? this.snapshot.head : this.snapshot.base,
        recursive: '1',
      });
      tree = new Map(
        result.data.tree
          .filter(
            (item) =>
              item.type === 'blob' && item.path && item.sha && item.mode,
          )
          .map((item) => [item.path!, { sha: item.sha!, mode: item.mode! }]),
      );
      this.trees.set(revision, tree);
    }
    const blob = tree.get(path);
    if (!blob || !['100644', '100755'].includes(blob.mode)) {
      throw new Error(
        'Only ordinary text files indexed at this revision are readable',
      );
    }
    const { data } = await this.github.client.rest.git.getBlob({
      owner: this.snapshot.target.owner,
      repo: this.snapshot.target.repo,
      file_sha: blob.sha,
    });
    if (data.encoding !== 'base64')
      throw new Error('Only ordinary text files are readable');
    if (data.size === null || data.size > MAX_FILE_BYTES)
      throw new Error('File exceeds source size limit');
    const buffer = Buffer.from(data.content, 'base64');
    if (buffer.includes(0)) throw new Error('Binary file is not readable');
    if (this.bytes + buffer.length > MAX_SOURCE_BYTES)
      throw new Error('Source read budget exhausted');
    this.bytes += buffer.length;
    const text = buffer.toString('utf8');
    this.cache.set(key, text);
    return text;
  }

  async read(
    path: string,
    revision: Revision,
    startLine: number,
    limit: number,
  ) {
    const lines = (await this.file(path, revision)).split('\n');
    const selected = lines.slice(startLine - 1, startLine - 1 + limit);
    return {
      path,
      revision,
      totalLines: lines.length,
      content: selected
        .map((line, index) => `${startLine + index}: ${line}`)
        .join('\n')
        .slice(0, 16_000),
      note: 'Content is bounded to 16,000 characters; use smaller line ranges if needed.',
    };
  }

  async search(query: string) {
    const changed = this.snapshot.files
      .map((file) => file.filename)
      .filter(isReviewablePath);
    const paths = [...new Set([...changed, ...this.snapshot.paths])].slice(
      0,
      30,
    );
    const matches: { path: string; line: number; text: string }[] = [];
    const unreadable: string[] = [];
    for (const path of paths) {
      try {
        const lines = (await this.file(path, 'head')).split('\n');
        for (let index = 0; index < lines.length; index++) {
          if (lines[index].includes(query)) {
            matches.push({
              path,
              line: index + 1,
              text: lines[index].slice(0, 500),
            });
          }
          if (matches.length === 30) break;
        }
      } catch {
        unreadable.push(path);
      }
      if (matches.length === 30) break;
    }
    return {
      matches,
      unreadable,
      note: 'Literal, head-only search; limited to first 30 indexed files and 30 matches. Absence is not proof of no callers.',
    };
  }
}
