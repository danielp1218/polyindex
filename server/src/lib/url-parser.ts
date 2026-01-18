import { fetchMarkets } from './polymarket-api';
import { logMessage, type Logger } from './logger';

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
async function fetchEventBySlug(
  slug: string,
  logger?: Logger
): Promise<string | null> {
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
    logMessage(logger, 'error', 'Error fetching event from Gamma API', error);
    return null;
  }
}

// Fetches all markets from an event by slug --> array of markets from the event
export async function fetchEventMarkets(
  slug: string,
  logger?: Logger
): Promise<any[]> {
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
    logMessage(logger, 'error', 'Error fetching event markets', error);
    return [];
  }
}

// what-price-will-bitcoin-hit-in-january-2026 -> "what price will bitcoin hit in january 2026"
function slugToQuestion(slug: string): string {
  return slug.replace(/-/g, ' ').toLowerCase();
}

// market url slug --> market's condition_id (CLOB ID)
export async function findMarketIdFromUrl(
  url: string,
  logger?: Logger
): Promise<string | null> {
  const slug = extractSlugFromUrl(url);
  if (!slug) {
    logMessage(logger, 'warn', 'Failed to extract slug from URL');
    return null;
  }

  logMessage(logger, 'log', `Attempting to find market for slug: ${slug}`);

  // First, try the Gamma API (handles events with multiple markets)
  const eventMarketId = await fetchEventBySlug(slug, logger);
  if (eventMarketId) {
    logMessage(logger, 'log', `Found market via Gamma API: ${eventMarketId}`);
    return eventMarketId;
  }

  logMessage(logger, 'log', 'Gamma API lookup failed, trying fallback search...');

  // Fall back to CLOB API for individual markets
  const markets = await fetchMarkets(logger);
  logMessage(logger, 'log', `Fetched ${markets.length} markets for fallback search`);

  // Try exact slug match
  let market = markets.find(m => m.market_slug === slug);

  if (market) {
    logMessage(
      logger,
      'log',
      `Found exact slug match: ${market.condition_id || market.id}`
    );
  } else {
    logMessage(logger, 'log', 'No exact slug match, trying fuzzy search...');
    // If no exact match, try partial matching with question
    const searchQuery = slugToQuestion(slug);
    logMessage(logger, 'log', `Searching for: "${searchQuery}"`);
    
    market = markets.find(m => {
      const question = m.question?.toLowerCase() || '';
      // Check if the question contains most of the words from the slug
      const slugWords = searchQuery.split(' ').filter(w => w.length > 2);
      const matchedWords = slugWords.filter(word => question.includes(word));
      // Consider it a match if at least 60% of significant words match
      return matchedWords.length >= slugWords.length * 0.6;
    });
    
    if (market) {
      logMessage(logger, 'log', `Found fuzzy match: ${market.question}`);
    } else {
      logMessage(logger, 'log', 'No fuzzy match found');
    }
  }

  // Return condition_id if available, otherwise fall back to id
  return market ? (market.condition_id || market.id) : null;
}

// Extracts market ID from either a URL or returns the ID if already provided
export async function parseMarketInput(
  input: string,
  logger?: Logger
): Promise<string> {
  // Check if input looks like a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    logMessage(logger, 'log', `Parsing URL: ${input}`);
    const slug = extractSlugFromUrl(input);
    logMessage(logger, 'log', `Extracted slug: ${slug}`);
    
    const marketId = await findMarketIdFromUrl(input, logger);
    if (!marketId) {
      throw new Error(`Could not find market for the provided URL: ${input}. Slug extracted: ${slug || 'none'}`);
    }
    logMessage(logger, 'log', `Resolved market ID: ${marketId}`);
    return marketId;
  }

  // Otherwise assume it's already a market ID
  logMessage(logger, 'log', `Using direct market ID: ${input}`);
  return input.trim();
}
