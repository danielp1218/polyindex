import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setupTracing } from './lib/phoenix';
import { healthRouter } from './routes/health';
import { relationsRouter } from './routes/relations';
import { toolsRouter } from './routes/tools';
import { relatedBetsRouter } from './routes/related-bets';

// Setup tracing
setupTracing();

const app = new Hono();

// CORS middleware
app.use('/*', cors());

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'Polyindex Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      relations: '/api/relations',
      relationsPricing: '/api/relations/price',
      relationsGraph: '/api/relations/graph',
      relatedBets: '/api/related-bets',
      tools: '/tools',
    },
  });
});

app.route('/health', healthRouter);
app.route('/api/relations', relationsRouter);
app.route('/api/related-bets', relatedBetsRouter);
app.route('/tools', toolsRouter);

const port = Number(process.env.PORT) || 8000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ Server running on http://localhost:${port}`);

console.log(`✓ Server running on http://localhost:${port}`);
