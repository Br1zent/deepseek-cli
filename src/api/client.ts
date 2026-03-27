import { APIError } from "../utils/errors.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
import { parseSSEStream, type StreamChunk } from "./streaming.js";
import type {
  APIMessage,
  ChatCompletionResponse,
  ToolCall,
  ToolDefinition,
  Usage,
} from "../agent/types.js";

export interface DeepSeekClientConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseUrl: string;
}

export interface ToolCallResponse {
  toolCalls: ToolCall[];
  content: string | null;
  usage?: Usage;
}

export class DeepSeekClient {
  private readonly config: DeepSeekClientConfig;

  constructor(config: DeepSeekClientConfig) {
    this.config = config;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async fetchWithRetry(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return withRetry(async () => {
      logger.debug(`POST ${this.config.baseUrl}${endpoint}`);

      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errBody = await response.json() as { error?: { message?: string } };
          if (errBody.error?.message) {
            errorMessage = errBody.error.message;
          }
        } catch { /* ignore */ }
        throw new APIError(errorMessage, response.status, retryAfter);
      }

      return response;
    });
  }

  async chat(messages: APIMessage[]): Promise<string> {
    const response = await this.fetchWithRetry("/chat/completions", {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    });

    const data = await response.json() as ChatCompletionResponse;
    const content = data.choices[0]?.message.content;
    return content ?? "";
  }

  async *chatStream(messages: APIMessage[]): AsyncIterable<string> {
    const response = await this.fetchWithRetry("/chat/completions", {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    });

    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "text" && chunk.text) {
        yield chunk.text;
      }
    }
  }

  async chatWithTools(
    messages: APIMessage[],
    tools: ToolDefinition[],
  ): Promise<ToolCallResponse> {
    const response = await this.fetchWithRetry("/chat/completions", {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      tools,
      tool_choice: "auto",
      stream: false,
    });

    const data = await response.json() as ChatCompletionResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw new APIError("No choices in API response");
    }

    return {
      toolCalls: choice.message.tool_calls ?? [],
      content: choice.message.content,
      usage: data.usage,
    };
  }

  async chatWithToolsStream(
    messages: APIMessage[],
    tools: ToolDefinition[],
  ): Promise<{ stream: AsyncIterable<StreamChunk>; getResponse: () => ToolCallResponse }> {
    const response = await this.fetchWithRetry("/chat/completions", {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      tools,
      tool_choice: "auto",
      stream: true,
    });

    const collectedToolCalls: ToolCall[] = [];
    let collectedUsage: Usage | undefined;

    const stream = parseSSEStream(response);

    return {
      stream: {
        [Symbol.asyncIterator]() {
          return stream[Symbol.asyncIterator]();
        },
      },
      getResponse: (): ToolCallResponse => ({
        toolCalls: collectedToolCalls,
        content: null,
        usage: collectedUsage,
      }),
    };
  }
}
