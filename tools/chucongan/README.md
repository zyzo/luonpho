# chucongan

An advisory GitHub PR reviewer for [Luon Phố](https://github.com/zyzo/luonpho), backed by the **OpenAI Responses API**. Reviews TypeScript correctness, usability, architecture, Three.js performance and gameplay trade-offs. Posts at most five high-confidence defects inline; unmeasured performance hypotheses and optional alternatives go in the review summary.

The reviewer is a separate Node.js package. It adds **no dependencies to the game bundle** and never executes PR code.

## Quick start: dry-run

Requires Node.js 22+, an OpenAI API key, and GitHub access.

```sh
# From the repository root
npm ci --prefix tools/chucongan
export OPENAI_API_KEY='...'
export OPENAI_MODEL='...'
gh auth login
npm run review:pr -- --repo zyzo/luonpho --pr 123 --dry-run
```

Choose a model available to your OpenAI project that supports the Responses API, function calling and strict Structured Outputs. There is deliberately no hardcoded model ID. Dry-run still incurs OpenAI usage, but **does not write to GitHub**.

The command prints JSON including the report, token usage, reviewed SHA and local artifact path. Add `--publish` to create one advisory `COMMENT` review. Add `--draft` to inspect a draft in dry-run only. `--model MODEL` overrides `OPENAI_MODEL`.

Authentication priority:

1. If `GITHUB_APP_ID` is set, use App credentials and `GITHUB_INSTALLATION_ID`.
2. Otherwise use `GITHUB_TOKEN`.
3. Otherwise use `gh auth token` (executed locally, never by the model).

A CLI review is authored by the token's account. To publish as **`chucongan[bot]`**, authenticate through the registered GitHub App. If using a raw installation token instead, set `CHUCONGAN_BOT_LOGIN` because installation tokens cannot call `/user`.

## Register and run the GitHub App

1. Register a GitHub App named **chucongan**, if that name is available. If you use another slug, update `CHUCONGAN_BOT_LOGIN` accordingly.
2. Set its webhook URL to `https://YOUR-HOST/webhooks` and generate a high-entropy webhook secret, e.g. `openssl rand -hex 32`.
3. Grant repository permissions: **Contents: read**, **Pull requests: read/write**, **Checks: read**. Metadata read is implicit. No Actions, administration, issues-write or organization permissions are needed.
4. Subscribe to **Pull request** and **Issue comment** events.
5. Generate a private key, install the App on **only `zyzo/luonpho`**, and record the App and installation IDs.
6. Copy `.env.example` to `.env` in this directory, replace the placeholders, and keep the key outside the checkout. Restrict both files to the service account.
7. Run the server from this directory:

```sh
npm ci
node --env-file=.env --import tsx src/server.ts
```

Alternatively, export the environment variables and run `npm run review:serve` from the repository root. The npm commands do not automatically load `.env`.

Put the service behind an HTTPS reverse proxy. It binds to `127.0.0.1:8787` by default. Set `HOST=0.0.0.0` only when needed, e.g. inside a container. `/health` is a simple liveness endpoint; it does not probe provider credentials. App installation tokens are repository-scoped and carry only the permissions listed above.

### Triggers

- PR opened, synchronized, reopened, marked ready for review, or edited to change its base.
- Exact `/chucongan review` issue comment on a PR, from a repository collaborator/member/owner. The worker additionally checks that the sender currently has write/maintain/admin permission.
- Drafts and closed PRs are skipped. Maintainer manual requests do not bypass deduplication for the same head/base SHA pair.

The webhook is authenticated against its **raw bytes** before parsing. Other repositories/events are ignored. Before a delivery can cancel another job, the server checks its head SHA against GitHub to reject delayed stale events.

### Persistence, retries and deployment

Use a durable `CHUCONGAN_STATE_DIR`, protected from other users. It stores reports and job metadata, but never credentials. New files are mode `0600`; newly created state directories are `0700`. Reports contain repository source excerpts, so treat them as private repository data. Configure retention/backups yourself.

Run **one server process** per state directory. `server.lock` prevents a second server from starting. Graceful shutdown releases the lock and leaves interrupted jobs queued for recovery. After a crash, verify the old process is dead before removing the stale lock and restarting. Do not run publishing CLIs concurrently with the server for the same PR; the disk queue is not a distributed lock.

GitHub publication is not blindly retried. The report is persisted before the write. On an ambiguous failure, redeliver the failed webhook or rerun the CLI: the publisher checks bot-authored reviews at that head/base SHA pair, reconciles an existing review, or reuses the cached report before trying one write. When `cached` is true, reported token usage belongs to the original analysis, not new OpenAI calls. This is best-effort reconciliation, not exactly-once delivery: GitHub has no create-review idempotency key and there is an unavoidable final freshness-check/write race.

Previous **unresolved, non-outdated** bot threads are fingerprinted to avoid repeating open issues. Resolved or outdated threads do not suppress a reintroduced issue. Fingerprints use category/path/title/source excerpts rather than line numbers; wording changes can still evade deduplication. Submitted reviews are never automatically deleted or threads automatically resolved.

Deploy the reviewer from a **trusted release/base checkout**, not the PR branch being reviewed. Do not place OpenAI/App credentials in jobs that execute PR code, or use `pull_request_target` to check out and run an untrusted branch.

## Review quality and scope

1. Capture the immutable head and merge-base SHAs and a bounded diff.
2. Supply relevant file paths, PR context, existing review comments and head-SHA check conclusions.
3. Let one agent inspect source/callers through `read_file` and literal `search_code` tools.
4. Run a separate challenge pass to disprove candidate findings.
5. Validate every exact source excerpt against its stated revision and source line. Drop invalid evidence.
6. Publish only high-confidence code defects with actual diff anchors inline; use a non-blocking summary for everything else.

All repository data is untrusted. PR changes to AGENTS.md, skills or the reviewer itself cannot change the running trusted review policy. Tool access is limited to `src/`, `tests/`, README, package/TypeScript/Vite configuration and the HTML entry point. Symlinks/submodules, binary files and out-of-allowlist paths are refused; source is fetched by immutable Git blob identity, not by following GitHub Contents API symlinks.

The trusted checklist in `src/policy.ts` covers batching/instancing versus culling, transform baking, shadows, pixel ratio/fill rate, materials, shared-resource disposal, renderer counters, frame-rate independence, seek/reset/loop behavior, audio lifecycle and accessible controls. It is grounded in official Three.js documentation and the existing lighting/materials skills. No third-party skills are dynamically downloaded or installed. Changes to the trusted policy should bump `POLICY_VERSION` in `src/schema.ts` to invalidate review markers/cache entries.

A comment explains **trigger → impact → why the PR causes it → smallest useful fix/trade-offs → verification**. Alternatives are explicitly optional. No invented FPS claims, no automatic approval/change request, no automatic fixes.

### Limits

| Bound                            | Current value                                                 |
| -------------------------------- | ------------------------------------------------------------- |
| Total review timeout             | 180 seconds                                                   |
| OpenAI requests                  | At most 8 (4 per pass)                                        |
| Output per request               | At most 6,000 tokens                                          |
| Tool calls                       | At most 16 total                                              |
| Serialized input per request     | 130,000 characters                                            |
| Tool observations                | 45,000 characters total                                       |
| Usage stop threshold             | 80,000 accumulated tokens, checked before the next request    |
| Changed file metadata            | First 100 files                                               |
| Included patches                 | 60,000 characters total                                       |
| Source file / total source reads | 128 KB / 400 KB                                               |
| Literal search                   | First 30 indexed files, changed files first; first 30 matches |
| Inline findings                  | At most 5                                                     |
| Candidate findings               | At most 12                                                    |
| Server concurrency / queued PRs  | 2 / 20                                                        |
| Daily server admissions          | 50 by default; `CHUCONGAN_DAILY_LIMIT` adjusts it             |

These are workload guardrails, **not a precise dollar cap**. The token threshold can be exceeded by the last response, and recovered jobs can consume additional requests. Set OpenAI project spending controls too. Coverage limitations are preserved in reports. Unread files and unsuccessful searches do not establish the absence of an issue. A partial static review is never an approval.

**Not implemented:** browser execution, base/head profiling, real-device measurements, automated accessibility/playtesting, arbitrary documentation browsing, a dashboard or distributed workers. Runtime verification must later run in disposable workers **without reviewer credentials**. Static performance findings remain hypotheses until measured.

## Checks

```sh
# From the repository root, after installing both packages
npm ci
npm ci --prefix tools/chucongan
npm run check
npm run review:check
npm run build
```

Tests use mocked Responses/GitHub APIs; they do not require credentials, spend OpenAI tokens, execute PR code or post comments. They cover tool restrictions/budgets, the challenge pass, source evidence, diff coordinates, stale SHA refusal, safe Markdown, publication/reconciliation, resolved-thread deduplication, HMAC validation, queue cancellation, daily admissions and restart recovery.

A real dry-run and GitHub App deployment still require your credentials and a PR number.
