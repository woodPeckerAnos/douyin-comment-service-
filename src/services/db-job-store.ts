/**
 * PostgreSQL Job 持久化：fetch_jobs / fetch_results（JSONB 快照）
 * + 双写 douyin_comments 规范化表。
 */
import { randomUUID } from "node:crypto";
import { getPool } from "../db/pool.js";
import { persistDouyinComments } from "../db/persist-douyin-comments.js";
import type { FetchJob, FetchOptions, FetchResult } from "../types/comment.js";

interface JobRow {
  job_id: string;
  status: FetchJob["status"];
  video_ids: string[];
  options: FetchOptions;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
}

interface ResultRow {
  video_id: string;
  status: FetchResult["status"];
  error: string | null;
  meta: FetchResult["meta"];
  comments: FetchResult["comments"];
  high_reply_comments: FetchResult["high_reply_comments"];
}

function rowToJob(row: JobRow, results: FetchResult[]): FetchJob {
  return {
    job_id: row.job_id,
    status: row.status,
    video_ids: row.video_ids,
    options: row.options,
    results,
    error: row.error ?? undefined,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at?.toISOString(),
  };
}

function resultRowToFetchResult(row: ResultRow): FetchResult {
  return {
    video_id: row.video_id,
    status: row.status,
    comments: row.comments,
    high_reply_comments: row.high_reply_comments,
    meta: row.meta,
    error: row.error ?? undefined,
  };
}

export class DbJobStore {
  /** 运行中 job 的进程内缓存，appendResult 与 getJob 共享同一对象引用 */
  private readonly memory = new Map<string, FetchJob>();

  async createJob(
    videoIds: string[],
    options: FetchOptions,
  ): Promise<FetchJob> {
    const jobId = randomUUID();
    const pool = getPool();

    await pool.query(
      `INSERT INTO fetch_jobs (job_id, status, video_ids, options)
       VALUES ($1, 'pending', $2::jsonb, $3::jsonb)`,
      [jobId, JSON.stringify(videoIds), JSON.stringify(options)],
    );

    const job: FetchJob = {
      job_id: jobId,
      status: "pending",
      video_ids: videoIds,
      options,
      results: [],
      created_at: new Date().toISOString(),
    };

    this.memory.set(jobId, job);
    return job;
  }

  async getJob(jobId: string): Promise<FetchJob | null> {
    const cached = this.memory.get(jobId);
    if (cached) {
      return cached;
    }

    const pool = getPool();
    const jobResult = await pool.query<JobRow>(
      `SELECT job_id, status, video_ids, options, error, created_at, completed_at
       FROM fetch_jobs WHERE job_id = $1`,
      [jobId],
    );

    if (jobResult.rows.length === 0) {
      return null;
    }

    const resultsResult = await pool.query<ResultRow>(
      `SELECT video_id, status, error, meta, comments, high_reply_comments
       FROM fetch_results WHERE job_id = $1 ORDER BY id`,
      [jobId],
    );

    const job = rowToJob(
      jobResult.rows[0],
      resultsResult.rows.map(resultRowToFetchResult),
    );
    this.memory.set(jobId, job);
    return job;
  }

  async updateJob(job: FetchJob): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE fetch_jobs
       SET status = $2, error = $3, completed_at = $4
       WHERE job_id = $1`,
      [
        job.job_id,
        job.status,
        job.error ?? null,
        job.completed_at ? new Date(job.completed_at) : null,
      ],
    );
    this.memory.set(job.job_id, job);
  }

  /** 事务：写 fetch_results JSONB 快照 + upsert douyin_comments / observations */
  async appendResult(jobId: string, result: FetchResult): Promise<FetchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const fetchResultRow = await client.query<{ id: number }>(
        `INSERT INTO fetch_results
           (job_id, video_id, status, error, meta, comments, high_reply_comments)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
         ON CONFLICT (job_id, video_id) DO UPDATE SET
           status = EXCLUDED.status,
           error = EXCLUDED.error,
           meta = EXCLUDED.meta,
           comments = EXCLUDED.comments,
           high_reply_comments = EXCLUDED.high_reply_comments
         RETURNING id`,
        [
          jobId,
          result.video_id,
          result.status,
          result.error ?? null,
          JSON.stringify(result.meta),
          JSON.stringify(result.comments),
          JSON.stringify(result.high_reply_comments),
        ],
      );

      const fetchResultId = fetchResultRow.rows[0]?.id;
      if (fetchResultId !== undefined) {
        await persistDouyinComments(client, fetchResultId, result);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    job.results.push(result);
    this.memory.set(jobId, job);
    return job;
  }

  async markRunning(jobId: string): Promise<FetchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }
    job.status = "running";
    await this.updateJob(job);
    return job;
  }

  async markCompleted(jobId: string): Promise<FetchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }
    job.status = "completed";
    job.completed_at = new Date().toISOString();
    await this.updateJob(job);
    return job;
  }

  async markFailed(jobId: string, error: string): Promise<FetchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }
    job.status = "failed";
    job.error = error;
    job.completed_at = new Date().toISOString();
    await this.updateJob(job);
    return job;
  }
}
