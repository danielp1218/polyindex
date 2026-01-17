import OpenAI from 'openai';
import type { PolymarketMarket, BetRelationship } from '../types';
import { fetchMarkets } from './polymarket-api';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface FoundRelatedBet {
  marketId: string;
  relationship: BetRelationship;
  reasoning: string;
}

export async function* findRelatedBets(
  sourceMarket: PolymarketMarket
): AsyncGenerator<FoundRelatedBet> {
  // Fetch all markets (limit to first 50 for performance)
  const allMarkets = await fetchMarkets();

  // Filter out the source market itself
  const candidateMarkets = allMarkets
    .filter(m => m.id !== sourceMarket.id)
    .slice(0, 50);

  // Build context for AI
  const systemPrompt = `You are analyzing prediction markets to find logical relationships.

Source Market:
- Question: ${sourceMarket.question}
- Description: ${sourceMarket.description}
- Outcomes: ${sourceMarket.outcomes.join(', ')}

Your task: Analyze candidate markets and identify which ones have logical relationships to the source market.

Relationship types:
- IMPLIES: Source market outcome logically implies candidate market outcome
- CONTRADICTS: Source and candidate markets cannot both resolve in certain ways
- PARTITION: Markets are mutually exclusive parts of a larger question

Return a JSON object with a "related" array containing related markets:
{
  "related": [
    {
      "marketId": "the market ID",
      "relationship": "IMPLIES" | "CONTRADICTS" | "PARTITION",
      "reasoning": "brief explanation of the relationship"
    }
  ]
}

Return empty array if no relationships found: {"related": []}`;

  // Process in batches of 10 to avoid token limits
  const batchSize = 10;
  for (let i = 0; i < candidateMarkets.length; i += batchSize) {
    const batch = candidateMarkets.slice(i, i + batchSize);

    const batchContext = batch.map((m, idx) =>
      `${i + idx + 1}. ID: ${m.id}
   Question: ${m.question}
   Description: ${m.description}
   Outcomes: ${m.outcomes.join(', ')}`
    ).join('\n\n');

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Candidate markets:\n\n${batchContext}` },
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content;
      if (!content) continue;

      const result = JSON.parse(content);
      const relatedBets = result.related || [];

      // Yield each found related bet
      for (const bet of relatedBets) {
        // Validate the relationship type
        const validRelationships: BetRelationship[] = ['IMPLIES', 'CONTRADICTS', 'PARTITION'];
        if (!validRelationships.includes(bet.relationship)) {
          // Default to placeholder if invalid
          bet.relationship = 'IMPLIES';
        }

        yield {
          marketId: bet.marketId,
          relationship: bet.relationship as BetRelationship,
          reasoning: bet.reasoning || 'AI-identified relationship',
        };
      }
    } catch (error) {
      console.error(`Error processing batch ${i}-${i + batchSize}:`, error);
      // Continue with next batch even if this one fails
    }
  }
}
