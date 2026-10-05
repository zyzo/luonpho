import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { Octokit } from '@octokit/rest';
import { openAIResponder } from './agent.ts';
import { appFactory, integer, required, target } from './config.ts';
import { GitHub } from './github.ts';
import { review } from './review.ts';
import { Store } from './store.ts';

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: 'zyzo/luonpho' },
      pr: { type: 'string' },
      model: { type: 'string' },
      publish: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      draft: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      `chucongan — advisory PR reviewer\n\nUsage: npm run review -- --repo owner/repo --pr N [--dry-run | --publish] [--draft] [--model MODEL]\n\nDry-run is the default and still calls OpenAI. --publish writes an advisory GitHub review.\nSet OPENAI_API_KEY and OPENAI_MODEL. Authenticate using GITHUB_TOKEN, gh auth, or GitHub App environment variables.\nReports are stored in CHUCONGAN_STATE_DIR (default: .chucongan). No PR code is executed.`,
    );
    return;
  }
  if (!values.pr) throw new Error('Provide --pr N');
  if (values.publish && values['dry-run'])
    throw new Error('Choose either --publish or --dry-run');
  if (values.publish && values.draft)
    throw new Error('Draft reviews are dry-run only');
  const selected = target(values.repo, values.pr);
  const model = values.model?.trim() || required('OPENAI_MODEL');
  const apiKey = required('OPENAI_API_KEY');
  const signal = AbortSignal.timeout(180_000);
  let github: GitHub;
  if (process.env.GITHUB_APP_ID) {
    const factory = await appFactory();
    github = await factory(
      integer(required('GITHUB_INSTALLATION_ID'), 'Installation ID'),
      selected.repo,
      signal,
    );
  } else {
    const token =
      process.env.GITHUB_TOKEN?.trim() ||
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
      }).trim();
    const client = new Octokit({
      auth: token,
      request: { signal, timeout: 15_000 },
    });
    const login =
      process.env.CHUCONGAN_BOT_LOGIN ||
      (await client.rest.users.getAuthenticated()).data.login;
    github = new GitHub(client, login);
  }
  const result = await review(github, selected, {
    model,
    publish: values.publish,
    includeDraft: values.draft,
    signal,
    responder: openAIResponder(apiKey),
    store: new Store(process.env.CHUCONGAN_STATE_DIR || '.chucongan'),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const status = (error as { status?: number }).status;
  const message =
    typeof status === 'number'
      ? `Upstream API failed (HTTP ${status}); publication may need reconciliation on retry.`
      : error instanceof Error
        ? error.message.slice(0, 300)
        : 'Review failed';
  console.error(`chucongan: ${message}`);
  process.exitCode = 1;
});
