-- Migration: 004_douyin_comments_schema_comments
-- Service:  douyin-comment-service
-- Database: douyin_comment
-- Purpose:  douyin_comments / douyin_comment_observations COMMENT ON
-- Depends:  003_douyin_comments.sql

COMMENT ON TABLE douyin_comments IS '抖音评论事实表；video_id 对应 content_discovery.platform_contents.platform_id（platform=douyin）';
COMMENT ON COLUMN douyin_comments.video_id IS '抖音 video_id；跨库逻辑 FK 至 platform_contents.platform_id';
COMMENT ON COLUMN douyin_comments.comment_id IS '抖音评论 ID';
COMMENT ON COLUMN douyin_comments.user_id IS '评论用户 ID';
COMMENT ON COLUMN douyin_comments.text IS '评论正文';
COMMENT ON COLUMN douyin_comments.digg_count IS '点赞数（最新观测）';
COMMENT ON COLUMN douyin_comments.reply_count IS '回复数（最新观测）';
COMMENT ON COLUMN douyin_comments.is_high_reply IS '是否高回复（reply_count >= 阈值）';
COMMENT ON COLUMN douyin_comments.create_time IS '评论发布时间';
COMMENT ON COLUMN douyin_comments.first_seen_at IS '首次入库时间';
COMMENT ON COLUMN douyin_comments.last_seen_at IS '最近一次拉取命中时间';

COMMENT ON TABLE douyin_comment_observations IS '某次 fetch_results 抽到的评论及 sample_bucket';
COMMENT ON COLUMN douyin_comment_observations.fetch_result_id IS '所属 fetch_results.id';
COMMENT ON COLUMN douyin_comment_observations.video_id IS '抖音 video_id';
COMMENT ON COLUMN douyin_comment_observations.comment_id IS '抖音评论 ID';
COMMENT ON COLUMN douyin_comment_observations.sample_bucket IS '分层抽样桶：top_digg | latest | high_reply | random | fill';
COMMENT ON COLUMN douyin_comment_observations.included_in_high_reply IS '是否同时出现在 high_reply_comments 子集';
COMMENT ON COLUMN douyin_comment_observations.observed_at IS '写入观测时间';
