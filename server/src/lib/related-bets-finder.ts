import OpenAI from 'openai';
import type { PolymarketMarket, BetRelationship } from '../types';
import { fetchMarkets } from './polymarket-api';
import { fetchEventMarkets } from './url-parser';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface FoundRelatedBet {
  marketId: string;
  relationship: BetRelationship;
  reasoning: string;
  yesPercentage: number;
  noPercentage: number;
}


function getMarketPercentages(market: PolymarketMarket): { yes: number; no: number } {
  if (market.tokens && market.tokens.length >= 2) {
    const yesToken = market.tokens.find(t => t.outcome.toLowerCase() === 'yes');
    const noToken = market.tokens.find(t => t.outcome.toLowerCase() === 'no');

    if (yesToken && noToken) {
      return {
        yes: Math.round(yesToken.price * 100),
        no: Math.round(noToken.price * 100)
      };
    }
  }
  return { yes: 50, no: 50 };
}

function getOutcomes(market: PolymarketMarket): string[] {
  // Try outcomes array first (legacy format)
  if (market.outcomes && Array.isArray(market.outcomes)) {
    return market.outcomes;
  }
  // Fall back to extracting from tokens array (CLOB format)
  if (market.tokens && Array.isArray(market.tokens)) {
    return market.tokens.map(t => t.outcome);
  }
  // Default fallback
  return ['Yes', 'No'];
}

export async function* findRelatedBets(
  sourceMarket: PolymarketMarket,
  eventSlug?: string
): AsyncGenerator<FoundRelatedBet> {
  const MAX_RESULTS = 4; // Stop after finding this many related bets
  let foundCount = 0;

  // If event slug provided, prioritize event markets (these are most relevant)
  let eventMarkets: any[] = [];
  if (eventSlug) {
    eventMarkets = await fetchEventMarkets(eventSlug);
    console.log(`Fetched ${eventMarkets.length} markets from the same event`);
  }

  // Only fetch general markets if we have event markets, to supplement
  const allMarkets = eventMarkets.length > 0 ? [] : await fetchMarkets();
  if (!eventSlug) {
    console.log(`Fetched ${allMarkets.length} markets from Gamma API`);
  }

  // Combine: event markets first (highest priority), then general markets
  const combinedMarkets = [...eventMarkets, ...allMarkets];

  // Filter out source market and remove duplicates
  const seenIds = new Set<string>();
  const candidateMarkets = combinedMarkets
    .filter(m => {
      const sourceId = sourceMarket.condition_id || sourceMarket.id;
      const candidateId = m.conditionId || m.condition_id || m.id;

      if (sourceId === candidateId) return false;
      if (seenIds.has(candidateId)) return false;

      seenIds.add(candidateId);
      return true;
    })
    .slice(0, 50); // Only analyze first 50 markets max

  console.log(`Analyzing ${candidateMarkets.length} candidate markets (stopping after ${MAX_RESULTS} found)`);

  const seenMarketIds = new Set<string>();

  // Multi-layer AI reasoning system
  const systemPrompt = `You are a prediction market analyst finding relationships between bets.

Source Market:
- Question: ${sourceMarket.question}
- Description: ${sourceMarket.description?.substring(0, 300)}...
- Outcomes: ${getOutcomes(sourceMarket).join(', ')}

MULTI-LAYER REASONING APPROACH:
Think about how a user betting on this market would reason about related markets.

Example: If betting NO on "LeBron James scores 40+ points":
- SUBEVENT: "LeBron James injury tonight" (event that would prevent 40+ points)
- SUBEVENT: "LeBron James misses game tonight" (directly prevents scoring)
- IMPLIES: "LeBron James scores under 30" (weaker outcome)
- PARTITION_OF: "LeBron James scores 30-39" (mutually exclusive range)
- WEAK_SIGNAL: "Lakers lose tonight" (correlated but not causal)

Relationship types:
- IMPLIES: One outcome logically implies another (if A happens, B is likely)
- CONTRADICTS: Outcomes cannot both be true
- PARTITION_OF: Part of the same larger question (mutually exclusive outcomes)
- SUBEVENT: A component event that directly affects the outcome
- CONDITIONED_ON: The outcome depends on this event happening
- WEAK_SIGNAL: Indirectly related, weak correlation

For EACH candidate market, think through:
1. Direct logical implications
2. Events that would cause/prevent the outcome
3. Correlated indicators
4. Mutually exclusive partitions

Return JSON with "related" array:
{
  "related": [
    {
      "marketId": "condition_id or id",
      "relationship": "IMPLIES|CONTRADICTS|PARTITION_OF|SUBEVENT|CONDITIONED_ON|WEAK_SIGNAL",
      "reasoning": "One critical sentence explaining the relationship"
    }
  ]
}

IMPORTANT: Only return the top 2-3 MOST RELEVANT relationships per batch.
Prioritize strong relationships (IMPLIES, CONTRADICTS, PARTITION_OF) over weak signals.
Return empty array if no strong relationships: {"related": []}`;

  // Process in batches - stop early when we have enough results
  const batchSize = 10; // Smaller batches for faster initial results
  for (let i = 0; i < candidateMarkets.length; i += batchSize) {
    // Early exit if we've found enough
    if (foundCount >= MAX_RESULTS) {
      console.log(`Stopping early - found ${foundCount} related bets`);
      break;
    }

    const batch = candidateMarkets.slice(i, i + batchSize);

    const batchContext = batch.map((m) => {
      const marketId = m.conditionId || m.condition_id || m.id;
      return `ID: ${marketId}
Question: ${m.question}
Description: ${m.description?.substring(0, 200)}...`;
    }).join('\n\n---\n\n');

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze these candidate markets:\n\n${batchContext}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent results
      });

      const content = completion.choices[0].message.content;
      if (!content) continue;

      const result = JSON.parse(content);
      const relatedBets = result.related || [];

      // Yield each found related bet
      for (const bet of relatedBets) {
        // Find the actual market
        const market = batch.find(m => {
          const marketId = m.conditionId || m.condition_id || m.id;
          return marketId === bet.marketId;
        });

        if (!market) continue;

        const marketId = market.conditionId || market.condition_id || market.id;

        // Skip if already seen
        if (seenMarketIds.has(marketId)) {
          continue;
        }

        seenMarketIds.add(marketId);

        // Validate relationship type
        const validRelationships: BetRelationship[] = [
          'IMPLIES', 'CONTRADICTS', 'PARTITION_OF', 'SUBEVENT', 'CONDITIONED_ON', 'WEAK_SIGNAL'
        ];
        const relationship = validRelationships.includes(bet.relationship)
          ? bet.relationship
          : 'WEAK_SIGNAL';

        // Get percentages
        const percentages = getMarketPercentages(market);

        yield {
          marketId,
          relationship: relationship as BetRelationship,
          reasoning: bet.reasoning || 'Related market',
          yesPercentage: percentages.yes,
          noPercentage: percentages.no,
        };

        foundCount++;

        // Stop if we've found enough
        if (foundCount >= MAX_RESULTS) {
          console.log(`Reached ${MAX_RESULTS} related bets - stopping search`);
          return;
        }
      }
    } catch (error) {
      console.error(`Error processing batch ${i}-${i + batchSize}:`, error);
      // Continue with next batch even if this one fails
    }
  }
}
