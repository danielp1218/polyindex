import { relatedBetsQueue } from "../core/related-bets-queue";
import { dependencyQueue } from "../core/queue";
import { findRelatedBets } from "../lib/related-bets-finder";
import { fetchMarket } from "../lib/polymarket-api";
import { broadcast } from "../core/sse";
import type { RelatedBet } from "../types";

let agentRunning = false;

export async function startRelatedBetsAgent() {
  if (agentRunning) {
    console.log("Related bets agent already running");
    return;
  }

  agentRunning = true;
  console.log("✓ Related bets agent loop started");

  while (agentRunning) {
    try {
      const job = relatedBetsQueue.getNext();

      if (job) {
        console.log(
          `Processing related bets job: ${job.id} for market ${job.sourceMarketId}`,
        );

        // Update status
        relatedBetsQueue.update(job.id, { status: "processing" });
        broadcast({ type: "related-bets-job-started", job });

        try {
          // Fetch source market
          const sourceMarket = await fetchMarket(job.sourceMarketId);
          relatedBetsQueue.update(job.id, { sourceMarket });

          // Find related bets using AI (streaming generator)
          let foundCount = 0;
          for await (const foundBet of findRelatedBets(sourceMarket)) {
            try {
              // Fetch full market data
              const market = await fetchMarket(foundBet.marketId);

              // Build related bet object
              const relatedBet: RelatedBet = {
                marketId: foundBet.marketId,
                market,
                relationship: foundBet.relationship,
                reasoning: foundBet.reasoning,
              };

              // Add to job's related bets list
              relatedBetsQueue.addRelatedBet(job.id, relatedBet);

              // IMMEDIATELY add to dependency queue
              const dependency = dependencyQueue.add(foundBet.marketId, market);
              dependencyQueue.update(dependency.id, {
                relatedBetsJobId: job.id,
                sourceMarketId: job.sourceMarketId,
                relationship: foundBet.relationship,
              });

              // Mark as processed
              relatedBetsQueue.markProcessed(job.id, foundBet.marketId);

              foundCount++;

              // Broadcast update
              broadcast({
                type: "related-bet-found",
                job: relatedBetsQueue.get(job.id),
                relatedBet,
                dependencyId: dependency.id,
              });

              console.log(
                `✓ Found related bet ${foundCount}: ${market.question}`,
              );
            } catch (error) {
              console.error(
                `Error processing found bet ${foundBet.marketId}:`,
                error,
              );
              // Continue with next bet
            }
          }

          // Mark job as completed
          relatedBetsQueue.update(job.id, { status: "completed" });
          broadcast({
            type: "related-bets-job-completed",
            job: relatedBetsQueue.get(job.id),
            totalFound: foundCount,
          });

          console.log(
            `✓ Completed related bets job ${job.id}: found ${foundCount} related bets`,
          );
        } catch (error) {
          // Mark job as failed
          relatedBetsQueue.update(job.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          broadcast({
            type: "related-bets-job-failed",
            job: relatedBetsQueue.get(job.id),
          });
          console.error(`✗ Failed related bets job ${job.id}:`, error);
        }
      }

      // Sleep before next iteration
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Related bets agent error:", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export function stopRelatedBetsAgent() {
  agentRunning = false;
  console.log("Related bets agent loop stopped");
}
