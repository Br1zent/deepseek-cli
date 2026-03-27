import { describe, it, expect } from "vitest";
import { parseSSEStream } from "../../src/api/streaming.js";

function makeSSEResponse(lines: string[]): Response {
  const body = lines.join("\n") + "\n";
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("parseSSEStream", () => {
  it("parses text chunks", async () => {
    const response = makeSSEResponse([
      'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const chunks: string[] = [];
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "text" && chunk.text) {
        chunks.push(chunk.text);
      }
    }

    expect(chunks.join("")).toBe("Hello world");
  });

  it("parses tool call chunks", async () => {
    const response = makeSSEResponse([
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"tc1","type":"function","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":\\"ls\\"}"}}]},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const toolCalls = [];
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "tool_call_complete" && chunk.toolCall) {
        toolCalls.push(chunk.toolCall);
      }
    }

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.function.name).toBe("bash");
    expect(toolCalls[0]?.function.arguments).toBe('{"command":"ls"}');
  });

  it("emits done at end", async () => {
    const response = makeSSEResponse([
      'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    let doneEmitted = false;
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "done") doneEmitted = true;
    }

    expect(doneEmitted).toBe(true);
  });

  it("handles empty lines gracefully", async () => {
    const response = makeSSEResponse([
      "",
      "  ",
      'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const texts: string[] = [];
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "text" && chunk.text) texts.push(chunk.text);
    }

    expect(texts).toContain("ok");
  });

  it("skips malformed JSON chunks", async () => {
    const response = makeSSEResponse([
      "data: {invalid json}",
      'data: {"choices":[{"index":0,"delta":{"content":"valid"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const texts: string[] = [];
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "text" && chunk.text) texts.push(chunk.text);
    }

    expect(texts).toContain("valid");
  });

  it("handles usage chunk", async () => {
    const response = makeSSEResponse([
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      "data: [DONE]",
    ]);

    let usage = null;
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === "usage") usage = chunk.usage;
    }

    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });
});
