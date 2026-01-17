import { Hono } from 'hono';
import { relatedBetsQueue } from '../core/related-bets-queue';
import { broadcast } from '../core/sse';

export const relatedBetsRouter = new Hono();

// Takes CLOB market ID (condition_id) directly from client
relatedBetsRouter.post('/', async (c) => {
  const { marketId } = await c.req.json<{ marketId: string }>();

  if (!marketId) {
    return c.json({ error: 'marketId required' }, 400);
  }

  // Create job
  const job = relatedBetsQueue.add(marketId.trim());

  // Broadcast to SSE clients
  broadcast({ type: 'related-bets-job-added', job });

  return c.json(job);
});

// Get all jobs
relatedBetsRouter.get('/', (c) => {
  return c.json(relatedBetsQueue.getAll());
});

// Get specific job
relatedBetsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const job = relatedBetsQueue.get(id);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});