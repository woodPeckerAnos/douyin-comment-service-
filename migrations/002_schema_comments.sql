-- Migration: 002_schema_comments
-- Service:  douyin-comment-service
-- Database: douyin_comment
-- Purpose:  表/字段语义注释（PostgreSQL COMMENT，可被 tbls 等工具导出）

COMMENT ON TABLE fetch_jobs IS '批量拉取抖音评论的异步任务';
COMMENT ON COLUMN fetch_jobs.job_id IS '任务 UUID，客户端/API 主键';
COMMENT ON COLUMN fetch_jobs.status IS 'pending | running | completed | failed';
COMMENT ON COLUMN fetch_jobs.video_ids IS '待拉取视频 ID 数组 JSON';
COMMENT ON COLUMN fetch_jobs.options IS '拉取参数 JSON，结构见 Projects/schemas/db/douyin-comment/fetch-options.schema.json';
COMMENT ON COLUMN fetch_jobs.error IS '任务级失败原因';
COMMENT ON COLUMN fetch_jobs.created_at IS '任务创建时间';
COMMENT ON COLUMN fetch_jobs.completed_at IS '任务结束时间（成功或失败）';

COMMENT ON TABLE fetch_results IS '单个视频在任务内的拉取结果';
COMMENT ON COLUMN fetch_results.job_id IS '所属 fetch_jobs.job_id';
COMMENT ON COLUMN fetch_results.video_id IS '抖音 video_id';
COMMENT ON COLUMN fetch_results.status IS 'ok | not_found | private | auth_expired | rate_limited | failed';
COMMENT ON COLUMN fetch_results.error IS '单视频失败原因';
COMMENT ON COLUMN fetch_results.meta IS '拉取统计 JSON，结构见 fetch-result-meta.schema.json';
COMMENT ON COLUMN fetch_results.comments IS 'Comment 对象数组 JSON，结构见 comment.schema.json';
COMMENT ON COLUMN fetch_results.high_reply_comments IS '高回复评论子集，元素结构同 comments';
