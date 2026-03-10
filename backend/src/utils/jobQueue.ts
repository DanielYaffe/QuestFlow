import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export type JobStatus = 'pending' | 'done' | 'failed';

export interface JobResult {
  _id: string;
  imageUrl: string;
  imageKey: string;
  userPrompt: string;
  fullPrompt: string;
  filters: object;
  createdAt: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  result?: JobResult;
  error?: string;
  emitter: EventEmitter;
}

const jobs = new Map<string, Job>();

export function createJob(): Job {
  const job: Job = {
    id: randomUUID(),
    status: 'pending',
    emitter: new EventEmitter(),
  };
  jobs.set(job.id, job);
  // Auto-clean after 10 minutes to prevent memory leaks
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function completeJob(id: string, result: JobResult): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'done';
  job.result = result;
  job.emitter.emit('done', result);
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.emitter.emit('failed', error);
}
