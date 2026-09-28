# chucongan service

A trusted standalone Node.js app for the GitHub App, deliberately outside the Vite/browser bundle. PostgreSQL stores deduplicated deliveries and durable, debounced review jobs; later issues add pinned context collection, the Responses reviewer, validation, and publication.

## Run locally

Set secrets in your shell (do not place production credentials in the repository), then start PostgreSQL and the service:

```sh
export GITHUB_WEBHOOK_SECRET='...'
export GITHUB_APP_ID='123'
export GITHUB_APP_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
docker compose -f agents/chucongan/compose.yaml up --build
```

Optional `GITHUB_INSTALLATION_ID` and `GITHUB_REPOSITORY=zyzo/luonpho` restrict accepted deliveries. The service only accepts signed `POST /webhooks/github` requests and provides `GET /health`.

`001_initial.sql` creates durable delivery, job, run, finding, publication, and feedback records. Migrations run at startup and are tracked in `schema_migrations`. Review patterns are versioned Markdown files in `patterns/`.

The job worker is scaffolded but not started until issue #2 and #3 provide a pinned context collector and reviewer. This avoids publishing or executing an incomplete reviewer.
