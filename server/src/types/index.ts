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
  question: string;
  description: string;
  outcomes: string[];
  volume: string;
  liquidity: string;
}

export type BetRelationship = 'IMPLIES' | 'CONTRADICTS' | 'PARTITION';

export interface RelatedBet {
  marketId: string;
  market: PolymarketMarket;
  relationship: BetRelationship;
  reasoning?: string;
}

export interface RelatedBetsJob {
  id: string;
  sourceMarketId: string;
  sourceMarket?: PolymarketMarket;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  relatedBets: RelatedBet[];
  error?: string;
  processedMarketIds: string[];
}
