import type { DeepSeekClient } from "../api/client.js";
import type { APIMessage } from "../agent/types.js";
import { logger } from "../utils/logger.js";

export class Summarizer {
  private readonly client: DeepSeekClient;
  private readonly tokenThreshold: number;

  constructor(client: DeepSeekClient, tokenThreshold = 6000) {
    this.client = client;
    this.tokenThreshold = tokenThreshold;
  }

  estimateTokens(messages: APIMessage[]): number {
    // Rough estimate: ~4 chars per token
    const text = messages
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join(" ");
    return Math.ceil(text.length / 4);
  }

  shouldSummarize(messages: APIMessage[]): boolean {
    return this.estimateTokens(messages) > this.tokenThreshold;
  }

  async summarizeOldTurns(messages: APIMessage[]): Promise<APIMessage[]> {
    if (messages.length < 6) return messages;

    const keepRecent = 4;
    const toSummarize = messages.slice(0, messages.length - keepRecent);
    const recent = messages.slice(messages.length - keepRecent);

    logger.debug(`Summarizing ${toSummarize.length} old messages to save tokens`);

    try {
      const summaryPrompt: APIMessage = {
        role: "user",
        content:
          "Summarize the following conversation concisely, preserving key decisions, code changes, and context:\n\n" +
          toSummarize
            .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
            .join("\n\n"),
      };

      const summary = await this.client.chat([summaryPrompt]);

      const summaryMessage: APIMessage = {
        role: "system",
        content: `[Conversation summary]\n${summary}`,
      };

      return [summaryMessage, ...recent];
    } catch (err) {
      logger.warn(`Failed to summarize conversation: ${String(err)}`);
      return messages;
    }
  }
}
