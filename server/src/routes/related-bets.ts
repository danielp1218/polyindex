import { Hono } from 'hono';
import { relatedBetsQueue } from '../core/related-bets-queue';
import { broadcast } from '../core/sse';
import { parseMarketInput } from '../lib/url-parser';

export const relatedBetsRouter = new Hono();

// Takes either a Polymarket URL or CLOB market ID (condition_id)
relatedBetsRouter.post('/', async (c) => {
  const { marketId, url } = await c.req.json<{ marketId?: string; url?: string }>();

  // Accept either marketId or url
  const input = marketId || url;

  if (!input) {
    return c.json({ error: 'Either marketId or url is required' }, 400);
  }

  try {
    // Parse the input - handles both URLs and direct market IDs
    const { marketId: resolvedMarketId, eventSlug } = await parseMarketInput(input);

    // Create job with event slug
    const job = relatedBetsQueue.add(resolvedMarketId, eventSlug);

    // Broadcast to SSE clients
    broadcast({ type: 'related-bets-job-added', job });

    return c.json(job);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to process market input'
    }, 400);
  }
});

// Get all jobs
relatedBetsRouter.get('/', (c) => {
  return c.json(relatedBetsQueue.getAll());
});

// Get specific job - minimal clean format
relatedBetsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const job = relatedBetsQueue.get(id);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Ultra-minimal format: just the essentials
  return c.json({
    status: job.status,
    dependencies: job.relatedBets.map(bet => ({
      url: bet.market.market_slug
        ? `https://polymarket.com/event/${bet.market.market_slug}`
        : bet.marketId,
      yesPercentage: bet.yesPercentage,
      noPercentage: bet.noPercentage,
      relationType: bet.relationship,
      reason: bet.reasoning,
    })),
  });
});