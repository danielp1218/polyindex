import type { RelatedBetsJob, RelatedBet } from '../types';

class RelatedBetsQueue {
  private queue: RelatedBetsJob[] = [];

  add(sourceMarketId: string, eventSlug?: string): RelatedBetsJob {
    const job: RelatedBetsJob = {
      id: crypto.randomUUID(),
      sourceMarketId,
      eventSlug,
      createdAt: Date.now(),
      status: 'pending',
      relatedBets: [],
      processedMarketIds: [],
    };
    this.queue.push(job);
    return job;
  }

  getNext(): RelatedBetsJob | undefined {
    return this.queue.find(job => job.status === 'pending');
  }

  update(id: string, updates: Partial<RelatedBetsJob>): void {
    const job = this.queue.find(j => j.id === id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  get(id: string): RelatedBetsJob | undefined {
    return this.queue.find(j => j.id === id);
  }

  getAll(): RelatedBetsJob[] {
    return [...this.queue];
  }

  // Add a new related bet to a job
  addRelatedBet(jobId: string, relatedBet: RelatedBet): void {
    const job = this.get(jobId);
    if (job) {
      job.relatedBets.push(relatedBet);
    }
  }

  // Mark a market as processed (added to dependency queue)
  markProcessed(jobId: string, marketId: string): void {
    const job = this.get(jobId);
    if (job && !job.processedMarketIds.includes(marketId)) {
      job.processedMarketIds.push(marketId);
    }
  }
}

export const relatedBetsQueue = new RelatedBetsQueue();
