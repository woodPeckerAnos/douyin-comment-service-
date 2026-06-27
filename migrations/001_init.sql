CREATE TABLE IF NOT EXISTS fetch_jobs (
  job_id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  video_ids JSONB NOT NULL,
  options JSONB NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fetch_results (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES fetch_jobs(job_id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  comments JSONB NOT NULL DEFAULT '[]',
  high_reply_comments JSONB NOT NULL DEFAULT '[]',
  UNIQUE (job_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_fetch_jobs_status ON fetch_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_results_video ON fetch_results(video_id);
