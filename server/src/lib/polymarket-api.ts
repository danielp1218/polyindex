// polymarket layer

import type { PolymarketMarket } from '../types';
import { logMessage, type Logger } from './logger';

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function fetchMarkets(
  logger?: Logger,
  limit: number = 1000
): Promise<PolymarketMarket[]> {
  // Use Gamma API for active/current markets (much better than CLOB)
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const response = await fetch(`${GAMMA_API}/markets?limit=${safeLimit}&closed=false`);
  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.statusText}`);
  }
  const markets = await response.json() as PolymarketMarket[];

  // Normalize the data - Gamma API returns markets directly, not in a data field
  return markets.map(m => ({
    ...m,
    // Ensure we have both id and condition_id fields
    id: m.id || m.condition_id || '',
    condition_id: m.condition_id || m.id,
  }));
}

export async function fetchMarket(
  id: string,
  logger?: Logger
): Promise<PolymarketMarket> {
  // Try Gamma API first (has more current data)
  let response = await fetch(`${GAMMA_API}/markets/${id}`);

  // Fall back to CLOB API if not found in Gamma
  if (!response.ok) {
    response = await fetch(`${CLOB_API}/markets/${id}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch market: ${response.statusText}`);
  }

  const data = await response.json() as PolymarketMarket;
  return {
    ...data,
    id: data.id || data.condition_id || '',
    condition_id: data.condition_id || data.id,
  };
}

export async function searchMarkets(
  query: string,
  logger?: Logger
): Promise<PolymarketMarket[]> {
  const markets = await fetchMarkets(logger);
  return markets.filter(m =>
    m.question?.toLowerCase().includes(query.toLowerCase())
  );
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  markets?: any[];
}

export async function searchEventsByKeywords(
  keywords: string,
  logger?: Logger
): Promise<PolymarketEvent[]> {
  try {
    const response = await fetch(
      `${GAMMA_API}/public-search?q=${encodeURIComponent(keywords)}&limit_per_type=20`
    );
    
    if (!response.ok) {
      logMessage(logger, 'error', 'Failed to search events', response.statusText);
      return [];
    }

    const result = await response.json() as { events?: PolymarketEvent[] };
    return result.events || [];
  } catch (error) {
    logMessage(logger, 'error', 'Error searching events by keywords', error);
    return [];
  }
}

export async function searchEventsByCategory(
  category: string,
  logger?: Logger
): Promise<PolymarketEvent[]> {
  // Use category as search term for fallback
  const categoryKeywords: Record<string, string> = {
    'Politics': 'politics election government',
    'Crypto': 'crypto bitcoin ethereum blockchain',
    'Sports': 'sports game league championship',
    'Science': 'science technology research',
    'Entertainment': 'entertainment movie celebrity',
    'Other': 'market prediction'
  };

  const searchTerms = categoryKeywords[category] || category;
  return searchEventsByKeywords(searchTerms, logger);
}
