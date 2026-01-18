export interface Dependency {
  id: string;
  marketId: string;
  market: PolymarketMarket;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  // Metadata from related bets job
  relatedBetsJobId?: string;
  sourceMarketId?: string;
  relationship?: BetRelationship;
}

export interface PolymarketMarket {
  id: string;
  condition_id?: string;
  market_slug?: string;
  question: string;
  description: string;
  outcomes?: string[];
  tokens?: Array<{ outcome: string; price: number }>;
  volume: string;
  liquidity: string;
}

export type BetRelationship =
  | 'IMPLIES'          // One outcome implies another
  | 'CONTRADICTS'      // Outcomes cannot both be true
  | 'PARTITION_OF'     // Part of the same larger question
  | 'SUBEVENT'         // A component event that affects the outcome
  | 'CONDITIONED_ON'   // Depends on this outcome
  | 'WEAK_SIGNAL';     // Indirectly related, weak correlation

export interface RelatedBet {
  marketId: string;
  market: PolymarketMarket;
  relationship: BetRelationship;
  reasoning: string;
  yesPercentage: number; 
  noPercentage: number;
}

export interface RelatedBetsJob {
  id: string;
  sourceMarketId: string;
  sourceMarket?: PolymarketMarket;
  eventSlug?: string; // Event slug if source was from an event URL
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  relatedBets: RelatedBet[];
  error?: string;
  processedMarketIds: string[];
}
