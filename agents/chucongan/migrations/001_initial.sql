CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE review_job_status AS ENUM ('queued', 'leased', 'completed', 'failed', 'superseded');

CREATE TABLE review_jobs (
  id BIGSERIAL PRIMARY KEY,
  pull_number INTEGER NOT NULL CHECK (pull_number > 0),
  head_sha TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status review_job_status NOT NULL DEFAULT 'queued',
  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_queued_review_per_pr ON review_jobs (pull_number) WHERE status = 'queued';
CREATE INDEX review_jobs_ready_index ON review_jobs (status, not_before) WHERE status = 'queued';

CREATE TABLE review_runs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL UNIQUE REFERENCES review_jobs(id),
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  merge_base_sha TEXT,
  context_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE findings (
  id BIGSERIAL PRIMARY KEY,
  review_run_id BIGINT NOT NULL REFERENCES review_runs(id),
  stable_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  location JSONB,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  correction TEXT NOT NULL,
  confidence NUMERIC(3, 2) CHECK (confidence BETWEEN 0 AND 1),
  UNIQUE (review_run_id, stable_id)
);

CREATE TABLE publications (
  id BIGSERIAL PRIMARY KEY,
  review_run_id BIGINT NOT NULL REFERENCES review_runs(id),
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  github_id BIGINT,
  github_url TEXT,
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE feedback (
  id BIGSERIAL PRIMARY KEY,
  finding_id BIGINT REFERENCES findings(id),
  author_login TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
