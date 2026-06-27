# douyin-comment-service — 数据库

## 概览

| 项 | 值 |
| :--- | :--- |
| 数据库名 | `douyin_comment` |
| SSOT | [`migrations/`](../migrations/) |
| 连接（容器内） | `postgres://dev:changeme@postgres:5432/douyin_comment` |

## ER 关系

```text
fetch_jobs (1) ──< fetch_results (N)
   job_id            job_id → fetch_jobs.job_id (ON DELETE CASCADE)
                     UNIQUE (job_id, video_id)
                           │
                           └──< douyin_comment_observations (N)
                                      │
                                      ▼
                              douyin_comments (N)
                                      │
                    （逻辑关联，跨库）  │
                                      ▼
                    content_discovery.platform_contents
                    (platform = douyin, platform_id = video_id)
```

## 表说明

### `fetch_jobs`

批量评论拉取任务。

**状态流转：**

```text
pending → running → completed
                 ↘ failed
```

| status | 含义 |
| :--- | :--- |
| `pending` | 已创建，尚未执行 |
| `running` | 正在拉取 |
| `completed` | 全部视频处理完毕 |
| `failed` | 任务级失败（见 `error`） |

### `fetch_results`

单视频拉取结果；`status` 见 [`src/types/comment.ts`](../src/types/comment.ts) 中 `FetchStatus`。

`comments` / `high_reply_comments` JSONB 仍保留（API 兼容）；成功拉取时同步双写至 `douyin_comments` + `douyin_comment_observations`。

### `douyin_comments`

抖音评论事实表（本服务专用，不与其他平台混用）。`video_id` 与 discovery 库 `platform_contents.platform_id` 逻辑对齐。

### `douyin_comment_observations`

某次 `fetch_results` 抽到的评论及 `sample_bucket`；同一 fetch 重跑时会替换该 fetch_result 的观测行。

## JSONB 字段

| 列 | 文档 |
| :--- | :--- |
| `video_ids` | `string[]`，抖音 video_id 列表 |
| `options` | [`Projects/schemas/db/douyin-comment/fetch-options.schema.json`](../../schemas/db/douyin-comment/fetch-options.schema.json) |
| `meta` | [`fetch-result-meta.schema.json`](../../schemas/db/douyin-comment/fetch-result-meta.schema.json) |
| `comments` / `high_reply_comments` | [`comment.schema.json`](../../schemas/db/douyin-comment/comment.schema.json) |

## 迁移历史

| 文件 | 说明 |
| :--- | :--- |
| `001_init.sql` | 初始表与索引 |
| `002_schema_comments.sql` | PostgreSQL COMMENT ON（fetch_*） |
| `003_douyin_comments.sql` | `douyin_comments` + `douyin_comment_observations` |
| `004_douyin_comments_schema_comments.sql` | 新表 COMMENT ON |

## 本地调试

```bash
docker exec -it postgres psql -U dev -d douyin_comment -c '\dt'
docker exec -it postgres psql -U dev -d douyin_comment -c "SELECT job_id, status, created_at FROM fetch_jobs ORDER BY created_at DESC LIMIT 5;"
docker exec -it postgres psql -U dev -d douyin_comment -c "SELECT video_id, count(*) FROM douyin_comments GROUP BY video_id ORDER BY count(*) DESC LIMIT 5;"
```
