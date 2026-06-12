import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredJob, TraceProofReport } from "@/types/traceproof";

/**
 * In-memory job store (a Map kept on globalThis so it survives Next.js dev
 * hot-reloads and is shared across route handlers in a single server process).
 *
 * As a resilience measure each job is also mirrored to
 * uploads/{jobId}/job.json so a report survives a server restart and can be
 * recovered if the process that created it is not the one serving the read.
 * This is best-effort: on read-only/serverless filesystems the disk writes are
 * ignored and the Map remains the source of truth.
 *
 * Swap this module for a database later without touching the route handlers.
 */

const globalStore = globalThis as typeof globalThis & {
  __traceProofJobs?: Map<string, StoredJob>;
};

function jobs(): Map<string, StoredJob> {
  if (!globalStore.__traceProofJobs) {
    globalStore.__traceProofJobs = new Map<string, StoredJob>();
  }
  return globalStore.__traceProofJobs;
}

function jobJsonPath(jobId: string): string {
  return path.join(process.cwd(), "uploads", jobId, "job.json");
}

async function persistToDisk(job: StoredJob): Promise<void> {
  try {
    const target = jobJsonPath(job.jobId);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(job, null, 2), "utf8");
  } catch {
    // Best-effort only; the in-memory Map remains authoritative.
  }
}

async function loadFromDisk(jobId: string): Promise<StoredJob | null> {
  try {
    const raw = await readFile(jobJsonPath(jobId), "utf8");
    return JSON.parse(raw) as StoredJob;
  } catch {
    return null;
  }
}

export async function createJob(job: StoredJob): Promise<StoredJob> {
  jobs().set(job.jobId, job);
  await persistToDisk(job);
  return job;
}

export async function getJob(jobId: string): Promise<StoredJob | null> {
  const inMemory = jobs().get(jobId);
  if (inMemory) return inMemory;

  const fromDisk = await loadFromDisk(jobId);
  if (fromDisk) {
    jobs().set(jobId, fromDisk);
    return fromDisk;
  }
  return null;
}

export async function updateJob(jobId: string, patch: Partial<StoredJob>): Promise<StoredJob | null> {
  const existing = jobs().get(jobId) ?? (await loadFromDisk(jobId));
  if (!existing) return null;

  const updated: StoredJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  jobs().set(jobId, updated);
  await persistToDisk(updated);
  return updated;
}

export async function setJobReport(jobId: string, report: TraceProofReport): Promise<StoredJob | null> {
  return updateJob(jobId, { status: "completed", report, failureMessage: null });
}

export async function failJob(jobId: string, message: string): Promise<StoredJob | null> {
  const existing = jobs().get(jobId) ?? (await loadFromDisk(jobId));
  return updateJob(jobId, {
    status: "failed",
    failureMessage: message,
    errors: [...(existing?.errors ?? []), message],
  });
}
