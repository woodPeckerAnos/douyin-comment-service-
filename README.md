# douyin-comment-service

批量拉取抖音公域视频一级评论。复用 [content-discovery-service](../content-discovery-service) 的浏览器 Profile 登录态，通过 Playwright Network 拦截 `/aweme/v1/web/comment/list/` 获取评论，并对 `reply_count >= 10` 的评论标注 `is_high_reply`。

## 前置条件

登录态由 discovery 服务维护，本服务不负责 login：

```bash
cd ../content-discovery-service
npm run login -- --platform douyin
```

Profile 默认路径：`../content-discovery-service/profiles/douyin`

**注意**：同一时刻只能有一个服务实例使用该 Profile（由外部调度服务保证互斥）。

若误报 `auth_expired`：旧版 `isLoggedIn` 在空白页读 `document.cookie` 会失败（`sessionid` 为 HttpOnly）。当前实现已改为通过 Playwright `context.cookies()` 检测。

**CLI 无输出、一直卡住**：通常是上一次 `npm run fetch` 的 Chrome 未退出，占用了 Profile。先 `Ctrl+C` 终止 CLI，再执行：

```bash
pgrep -fl "user-data-dir.*profiles/douyin"
# 若有残留进程，kill <pid>（主进程通常是第一条 Chrome）
```

新版 CLI 会在 stderr 打印进度（`[HH:MM:SS] ...`），若 Profile 被占用会立即报错而不是 silent hang。

## 快速开始

```bash
cd ~/Projects/douyin-comment-service
cp .env.example .env
npm install
npm run dev
```

## API


| Method | Path                            | 说明                     |
| ------ | ------------------------------- | ---------------------- |
| GET    | `/health`                       | 健康检查（含 queue 状态）      |
| POST   | `/api/comments/fetch`           | 异步批量拉取，返回 `{ job_id }` |
| GET    | `/api/comments/fetch/:jobId`    | 查询 Job 状态与结果           |
| GET    | `/api/videos/:videoId/comments` | 同步单视频（调试）              |
| POST   | `/api/queue/comments/fetch`     | 入队批量拉取（需 `DATABASE_URL`） |


### 批量拉取示例

```bash
curl -X POST http://localhost:3001/api/comments/fetch \
  -H 'Content-Type: application/json' \
  -d '{
    "video_ids": ["7123456789012345678"],
    "options": {
      "max_comments_per_video": 500,
      "high_reply_threshold": 10,
      "delay_ms": 1500,
      "sampling": {
        "enabled": true,
        "over_fetch_target": 1500,
        "quotas": {
          "top_by_digg": 200,
          "latest_by_time": 150,
          "high_reply": 100,
          "random": 50
        }
      }
    }
  }'
```

```bash
curl http://localhost:3001/api/comments/fetch/<job_id>
```

### 与 discovery 对接

调度服务从 discovery 输出 JSON 的 `items[].platformId` 提取 video_id，传入本服务即可。两服务无直接 HTTP 依赖。

```bash
# discovery 搜索
cd ../content-discovery-service
npm run search -- --platform douyin --keyword "水晶" --limit 10

# 调度服务读取 results/*.json，调用本服务 POST /api/comments/fetch
```

## CLI 调试

```bash
npm run fetch -- --video-id 7123456789012345678
npm run fetch -- --video-id "https://www.douyin.com/video/7123456789012345678" --limit 500 --threshold 20
npm run fetch -- --video-id 7123456789012345678 --no-sampling
npm run fetch -- --video-id 7123456789012345678 --over-fetch 2000
```

## 分层抽样

评论总量远大于 cap 时，默认开启**分层配额抽样**（`SAMPLING_ENABLED=true`）：

1. **Over-fetch**：先收集 `SAMPLING_OVER_FETCH_TARGET`（默认 1500）条
2. **分层抽样**：再按配额选出 `max_comments_per_video`（默认 500）条

| 配额桶 | 默认条数 | 说明 |
|--------|----------|------|
| `top_by_digg` | 200 | 点赞最高 |
| `latest_by_time` | 150 | 时间最新 |
| `high_reply` | 100 | 高回复（`reply_count >= threshold`） |
| `random` | 50 | 剩余池随机 |

结果中每条评论带 `sample_bucket` 字段；`meta.sampling` 记录各桶实际条数与抽样前总量 `collected_raw`。

## 环境变量


| 变量                       | 说明            | 默认                            |
| ------------------------ | ------------- | ----------------------------- |
| `PORT`                   | HTTP 端口       | `3001`                        |
| `HEADLESS`               | 无头浏览器         | `true`                        |
| `BROWSER_CHANNEL`        | 浏览器渠道         | `chrome`                      |
| `BROWSER_PROFILE_DIR`    | 共享 Profile 路径 | discovery 的 `profiles/douyin` |
| `MAX_COMMENTS_PER_VIDEO` | 单视频评论上限       | `500`                         |
| `HIGH_REPLY_THRESHOLD`   | 高回复标注阈值       | `10`                          |
| `REQUEST_DELAY_MS`       | 视频间延迟         | `1500`                        |
| `JOBS_DIR`               | Job 状态目录      | `./jobs`                      |
| `RESULTS_DIR`            | 结果快照目录        | `./results`                   |
| `SAMPLING_ENABLED`       | 启用分层抽样         | `true`                        |
| `SAMPLING_OVER_FETCH_TARGET` | 抽样前 over-fetch 条数 | `1500`                    |
| `DATABASE_URL`               | PostgreSQL 连接（可选，启用 DB 持久化） | — |
| `REDIS_HOST` / `REDIS_PORT`  | job-queue Redis 连接 | `127.0.0.1` / `6379` |
| `QUEUE_NAME`                 | Redis Stream 前缀 | `jobs` |
| `QUEUE_DEFAULT_JOB_NAME`     | HTTP 入队默认 job 名 | `douyin_fetch_comments` |
| `WORKER_CONCURRENCY`         | Worker 并发（建议 1） | `1` |
| `WORKER_NAME`                | Consumer 名称前缀 | `douyin-comment` |


## 脚本


| 命令                  | 说明             |
| ------------------- | -------------- |
| `npm run dev`       | 开发模式启动 HTTP 服务 |
| `npm run worker`    | 启动 Redis 队列 Worker |
| `npm run fetch`     | CLI 单视频拉取      |
| `npm run build`     | 编译 TypeScript  |
| `npm start`         | 运行编译产物（HTTP） |
| `npm test`          | 单元测试           |
| `npm run typecheck` | 类型检查           |


## 消息队列（job-queue）

使用 [job-queue](../job-queue/) SDK（Redis Streams），与 [job-scheduler](../job-scheduler/) 对接。Job 名须与 `config/queue-jobs.yaml` 及 scheduler 的 `jobs.yaml` 一致。

```bash
# 1. 构建 job-queue SDK
cd ../job-queue/node && npm run build

# 2. 安装依赖并配置 .env（REDIS_* 等）
cd ../douyin-comment-service && npm install

# 3. PC 宿主机启动 Worker（与 discovery Worker 互斥 Profile）
npm run worker
```

### HTTP 入队

```bash
curl -X POST http://localhost:3001/api/queue/comments/fetch \
  -H 'Content-Type: application/json' \
  -H 'X-Trace-Id: pipeline-run-42' \
  -d '{
    "video_ids": ["7123456789012345678"],
    "options": { "delay_ms": 1500 }
  }'
```

Payload 结构见 `src/mq/payload.ts`（`video_ids` + 可选 `options` / `trace_id`）。

## 架构

```
src/server/          Koa HTTP
  app.ts / start.ts  应用组装与启动
  routes/            HTTP 路由
src/mq/              job-queue handler 注册与入队
src/worker.ts        Redis Worker 入口
services/            BatchProcessor / CommentFetcher / JobStore
```

## 合规说明

仅供个人/内部分析与选题调研。请遵守各平台服务条款，勿用于未授权的大规模抓取或商业分发。