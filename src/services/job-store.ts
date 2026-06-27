import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDatabaseEnabled } from "../db/pool.js";
import { DbJobStore } from "./db-job-store.js";
import { getConfig } from "../config.js";
import type { FetchJob, FetchOptions, FetchResult } from "../types/comment.js";

export interface JobStoreLike {
  createJob(videoIds: string[], options: FetchOptions): Promise<FetchJob>;
  getJob(jobId: string): Promise<FetchJob | null>;
  updateJob(job: FetchJob): Promise<void>;
  appendResult(jobId: string, result: FetchResult): Promise<FetchJob | null>;
  markRunning(jobId: string): Promise<FetchJob | null>;
  markCompleted(jobId: string): Promise<FetchJob | null>;
  markFailed(jobId: string, error: string): Promise<FetchJob | null>;
}

export class JobStore implements JobStoreLike {
  private readonly memory = new Map<string, FetchJob>();

  async createJob(
    videoIds: string[],
    options: FetchOptions,
  ): Promise<FetchJob> {
    const config = getConfig();
    await fs.mkdir(config.jobsPath, { recursive: true });
    await fs.mkdir(config.resultsPath, { recursive: true });

    const job: FetchJob = {
      job_id: randomUUID(),
      status: "pending",
      video_ids: videoIds,
      options,
      results: [],
      created_at: new Date().toISOString(),
    };

    this.memory.set(job.job_id, job);
    await this.persist(job);
    return job;
  }

  async getJob(jobId: string): Promise<FetchJob | null> {
    const cached = this.memory.get(jobId);
    if (cached) {
      return cached;
    }

    const config = getConfig();
    const filePath = path.join(config.jobsPath, `${jobId}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const job = JSON.parse(raw) as FetchJob;
      this.memory.set(job.job_id, job);
      return job;
    } catch {
      return null;
    }
  }

  async updateJob(job: FetchJob): Promise<void> {
    this.memory.set(job.job_id, job);
    await this.persist(job);
  }

  async appendResult(jobId: string, result: FetchResult): Promise<FetchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    job.results.push(result);
    await this.updateJob(job);
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
    await this.writeResultSnapshot(job);
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
    await this.writeResultSnapshot(job);
    return job;
  }

  private async persist(job: FetchJob): Promise<void> {
    const config = getConfig();
    const filePath = path.join(config.jobsPath, `${job.job_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(job, null, 2), "utf8");
  }

  private async writeResultSnapshot(job: FetchJob): Promise<void> {
    const config = getConfig();
    const filePath = path.join(config.resultsPath, `${job.job_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(job, null, 2), "utf8");
  }
}

let store: JobStoreLike | null = null;

export function getJobStore(): JobStoreLike {
  if (!store) {
    store = isDatabaseEnabled() ? new DbJobStore() : new JobStore();
  }
  return store;
}

export function resetJobStoreForTests(): void {
  store = null;
}
