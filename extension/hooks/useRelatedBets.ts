import { useState, useEffect, useCallback, useRef } from 'react';
import { GraphData, Node, Link, BetRelationship } from '@/types/graph';
import {
  fetchRelatedBets,
  RelatedBetsResponse,
  StreamProgress,
} from '@/services/relatedBetsApi';

export interface UseRelatedBetsResult {
  graphData: GraphData | null;
  isLoading: boolean;
  error: string | null;
  progress: string | null;
  refetch: () => void;
}

export interface MiniGraphData {
  nodes: Array<{
    id: string;
    label: string;
    fullLabel: string;
    x: number;
    y: number;
    imageUrl?: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    relationship?: BetRelationship;
    reasoning?: string;
  }>;
  sourceLabel: string;
  targetLabel: string;
  reasoning: string;
  sourceImageUrl?: string;
}

export function useRelatedBets(url: string | null, profileImage?: string | null): UseRelatedBetsResult {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setProgress(null);

    try {
      const response = await fetchRelatedBets({
        url,
        signal: abortController.signal,
        onProgress: (progressUpdate: StreamProgress) => {
          setProgress(progressUpdate.message);
        },
      });

      const transformedData = transformToGraphData(response, profileImage || undefined);
      setGraphData(transformedData);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      setError((err as Error).message || 'Failed to fetch related bets');
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        setProgress(null);
      }
    }
  }, [url, profileImage]);

  useEffect(() => {
    if (url) {
      fetchData();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [url, fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { graphData, isLoading, error, progress, refetch };
}

function transformToGraphData(response: RelatedBetsResponse, profileImage?: string): GraphData {
  const nodes: Node[] = [];
  const links: Link[] = [];

  // Add source market as root node with profile image
  const sourceNode: Node = {
    id: response.sourceMarket.id,
    label: response.sourceMarket.question,
    slug: response.sourceMarket.slug,
    marketId: response.sourceMarket.id,
    imageUrl: profileImage,
  };
  nodes.push(sourceNode);

  // Add related bets as nodes and create links
  for (const bet of response.relatedBets) {
    const node: Node = {
      id: bet.marketId,
      label: bet.question,
      slug: bet.slug,
      url: bet.url,
      marketId: bet.marketId,
      yesPercentage: bet.yesPercentage,
      noPercentage: bet.noPercentage,
      imageUrl: bet.imageUrl, // Pass through the hardcoded image
    };
    nodes.push(node);

    const link: Link = {
      source: response.sourceMarket.id,
      target: bet.marketId,
      relationship: bet.relationship,
      reasoning: bet.reasoning,
    };
    links.push(link);
  }

  return { nodes, links };
}

// Helper to create mini graph data for decision screen
export function createMiniGraphData(graphData: GraphData | null): MiniGraphData | null {
  if (!graphData || graphData.nodes.length < 2) {
    return null;
  }

  const sourceNode = graphData.nodes[0];
  const targetNode = graphData.nodes[1];
  const link = graphData.links[0];

  // Create abbreviations from labels (take first letters of words)
  const createAbbreviation = (label: string): string => {
    const words = label.split(/\s+/).filter(w => w.length > 2);
    return words
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
  };

  const miniNodes = [
    {
      id: sourceNode.id,
      label: createAbbreviation(sourceNode.label),
      fullLabel: sourceNode.label,
      x: 70,
      y: 55,
      imageUrl: sourceNode.imageUrl,
    },
    {
      id: targetNode.id,
      label: createAbbreviation(targetNode.label),
      fullLabel: targetNode.label,
      x: 270,
      y: 55,
      imageUrl: targetNode.imageUrl,
    },
  ];

  const miniLinks = [
    {
      source: sourceNode.id,
      target: targetNode.id,
      relationship: (link as Link).relationship,
      reasoning: (link as Link).reasoning,
    },
  ];

  return {
    nodes: miniNodes,
    links: miniLinks,
    sourceLabel: sourceNode.label,
    targetLabel: targetNode.label,
    reasoning: (link as Link).reasoning || '',
    sourceImageUrl: sourceNode.imageUrl,
  };
}
