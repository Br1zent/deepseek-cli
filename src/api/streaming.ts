import { APIError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { ToolCall, Usage } from "../agent/types.js";

export interface StreamChunk {
  type: "text" | "tool_call_delta" | "tool_call_complete" | "usage" | "done";
  text?: string;
  toolCall?: ToolCall;
  toolCallIndex?: number;
  usage?: Usage;
}

interface PartialToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new APIError("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const partialToolCalls: Map<number, PartialToolCall> = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === ":") continue;

        if (!trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);

        if (data === "[DONE]") {
          // Emit any completed tool calls
          for (const [index, tc] of partialToolCalls) {
            yield { type: "tool_call_complete", toolCall: tc, toolCallIndex: index };
          }
          yield { type: "done" };
          return;
        }

        try {
          const parsed: unknown = JSON.parse(data);
          if (!isSSEChunk(parsed)) continue;

          const choice = parsed.choices[0];
          if (!choice) continue;

          const delta = choice.delta;

          if (delta.content) {
            yield { type: "text", text: delta.content };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = partialToolCalls.get(idx);

              if (!existing) {
                partialToolCalls.set(idx, {
                  id: tc.id ?? "",
                  type: "function",
                  function: {
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? "",
                  },
                });
              } else {
                if (tc.id && !existing.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              }
            }
          }

          if (parsed.usage) {
            yield { type: "usage", usage: parsed.usage };
          }
        } catch (err) {
          logger.debug(`Failed to parse SSE chunk: ${String(err)}`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Emit tool calls if stream ended without [DONE]
  for (const [index, tc] of partialToolCalls) {
    yield { type: "tool_call_complete", toolCall: tc, toolCallIndex: index };
  }
  yield { type: "done" };
}

interface SSEDelta {
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface SSEChunk {
  choices: Array<{
    delta: SSEDelta;
    finish_reason?: string | null;
    index: number;
  }>;
  usage?: Usage;
}

function isSSEChunk(val: unknown): val is SSEChunk {
  return (
    typeof val === "object" &&
    val !== null &&
    "choices" in val &&
    Array.isArray((val as SSEChunk).choices)
  );
}
