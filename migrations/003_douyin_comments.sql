-- Migration: 003_douyin_comments
-- Service:  douyin-comment-service
-- Database: douyin_comment
-- Purpose:  抖音评论事实表 + 单次拉取观测表（逻辑关联 content_discovery.platform_contents.platform_id）
-- Breaking: 否

CREATE TABLE IF NOT EXISTS douyin_comments (
  video_id       TEXT NOT NULL,
  comment_id     TEXT NOT NULL,
  user_id        TEXT NOT NULL DEFAULT '',
  text           TEXT NOT NULL,
  digg_count     INT NOT NULL DEFAULT 0,
  reply_count    INT NOT NULL DEFAULT 0,
  is_high_reply  BOOLEAN NOT NULL DEFAULT false,
  create_time    TIMESTAMPTZ NOT NULL,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_douyin_comments_video_digg
  ON douyin_comments (video_id, digg_count DESC);

CREATE INDEX IF NOT EXISTS idx_douyin_comments_video_time
  ON douyin_comments (video_id, create_time DESC);

CREATE INDEX IF NOT EXISTS idx_douyin_comments_high_reply
  ON douyin_comments (video_id)
  WHERE is_high_reply = true;

CREATE TABLE IF NOT EXISTS douyin_comment_observations (
  id                     BIGSERIAL PRIMARY KEY,
  fetch_result_id        BIGINT NOT NULL REFERENCES fetch_results(id) ON DELETE CASCADE,
  video_id               TEXT NOT NULL,
  comment_id             TEXT NOT NULL,
  sample_bucket          TEXT,
  included_in_high_reply BOOLEAN NOT NULL DEFAULT false,
  observed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fetch_result_id, video_id, comment_id),
  FOREIGN KEY (video_id, comment_id)
    REFERENCES douyin_comments (video_id, comment_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_douyin_comment_obs_fetch
  ON douyin_comment_observations (fetch_result_id);

CREATE INDEX IF NOT EXISTS idx_douyin_comment_obs_video
  ON douyin_comment_observations (video_id);
