import { fetchMarkets } from './polymarket-api';

const GAMMA_API = 'https://gamma-api.polymarket.com';

// https://polymarket.com/event/what-price-will-bitcoin-hit-in-january-2026 --> what-price-will-bitcoin-hit-in-january-2026
export function extractSlugFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Check if it's a polymarket.com URL
    if (!urlObj.hostname.includes('polymarket.com')) {
      return null;
    }

    // Extract the slug from /event/[slug] pattern
    const match = urlObj.pathname.match(/\/event\/([^\/]+)/);
    if (match && match[1]) {
      return match[1];
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Fetches event from Gamma API by slug --> Returns the first market's condition_id if found
async function fetchEventBySlug(slug: string): Promise<string | null> {
  try {
    const response = await fetch(`${GAMMA_API}/events?slug=${slug}`);
    if (!response.ok) {
      return null;
    }

    const events = await response.json() as Array<{
      markets?: Array<{ conditionId?: string }>;
    }>;

    if (events && events.length > 0 && events[0].markets && events[0].markets.length > 0) {
      // Return the first market's condition_id
      return events[0].markets[0].conditionId || null;
    }

    return null;
  } catch (error) {
    console.error('Error fetching event from Gamma API:', error);
    return null;
  }
}

// Fetches all markets from an event by slug --> array of markets from the event
export async function fetchEventMarkets(slug: string): Promise<any[]> {
  try {
    const response = await fetch(`${GAMMA_API}/events?slug=${slug}`);
    if (!response.ok) {
      return [];
    }

    const events = await response.json() as Array<{
      markets?: any[];
    }>;

    if (events && events.length > 0 && events[0].markets) {
      return events[0].markets;
    }

    return [];
  } catch (error) {
    console.error('Error fetching event markets:', error);
    return [];
  }
}

// what-price-will-bitcoin-hit-in-january-2026 -> "what price will bitcoin hit in january 2026"
function slugToQuestion(slug: string): string {
  return slug.replace(/-/g, ' ').toLowerCase();
}

// market url slug --> market's condition_id (CLOB ID)
export async function findMarketIdFromUrl(url: string): Promise<string | null> {
  const slug = extractSlugFromUrl(url);
  if (!slug) {
    return null;
  }

  // First, try the Gamma API (handles events with multiple markets)
  const eventMarketId = await fetchEventBySlug(slug);
  if (eventMarketId) {
    return eventMarketId;
  }

  // Fall back to CLOB API for individual markets
  const markets = await fetchMarkets();

  // Try exact slug match
  let market = markets.find(m => m.market_slug === slug);

  // If no exact match, try partial matching with question
  if (!market) {
    const searchQuery = slugToQuestion(slug);
    market = markets.find(m => {
      const question = m.question?.toLowerCase() || '';
      // Check if the question contains most of the words from the slug
      const slugWords = searchQuery.split(' ').filter(w => w.length > 2);
      const matchedWords = slugWords.filter(word => question.includes(word));
      // Consider it a match if at least 60% of significant words match
      return matchedWords.length >= slugWords.length * 0.6;
    });
  }

  // Return condition_id if available, otherwise fall back to id
  return market ? (market.condition_id || market.id) : null;
}

// Extracts market ID from either a URL or returns the ID if already provided
// Also returns event slug if URL is an event
export async function parseMarketInput(input: string): Promise<{ marketId: string; eventSlug?: string }> {
  // Check if input looks like a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const slug = extractSlugFromUrl(input);
    const marketId = await findMarketIdFromUrl(input);
    if (!marketId) {
      throw new Error('Could not find market for the provided URL');
    }
    return { marketId, eventSlug: slug || undefined };
  }

  // Otherwise assume it's already a market ID
  return { marketId: input.trim() };
}
