// polymarket layer

import type { PolymarketMarket } from '../types';

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function fetchMarkets(): Promise<PolymarketMarket[]> {
  // Use Gamma API for active/current markets (much better than CLOB)
  const response = await fetch(`${GAMMA_API}/markets?limit=1000&closed=false`);
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

export async function fetchMarket(id: string): Promise<PolymarketMarket> {
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

export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  const markets = await fetchMarkets();
  return markets.filter(m =>
    m.question?.toLowerCase().includes(query.toLowerCase())
  );
}
