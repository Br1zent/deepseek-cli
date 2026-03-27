import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../src/agent/agent.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ConversationHistory } from "../src/context/conversation.js";
import { BaseTool, type ToolResult } from "../src/tools/base.js";
import type { DeepSeekClient } from "../src/api/client.js";
import type { JSONSchema } from "../src/agent/types.js";

class EchoTool extends BaseTool {
  readonly name = "echo";
  readonly description = "Echo input back";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    return this.success(String(args["text"] ?? ""));
  }
}

function makeClient(responses: Array<{
  toolCalls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  content?: string | null;
}>): DeepSeekClient {
  let callCount = 0;
  return {
    chatWithTools: vi.fn().mockImplementation(async () => {
      const resp = responses[callCount] ?? { toolCalls: [], content: "Done" };
      callCount++;
      return {
        toolCalls: resp.toolCalls ?? [],
        content: resp.content ?? null,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    }),
    chat: vi.fn(),
    chatStream: vi.fn(),
  } as unknown as DeepSeekClient;
}

describe("Agent", () => {
  let registry: ToolRegistry;
  let history: ConversationHistory;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new EchoTool());
    history = new ConversationHistory();
  });

  it("runs text response and terminates", async () => {
    const client = makeClient([{ toolCalls: [], content: "Hello, world!" }]);

    const agent = new Agent(client, registry, history, {
      autoApprove: true,
      stream: false,
      debug: false,
    });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await agent.run("Say hello");

    expect(client.chatWithTools).toHaveBeenCalledTimes(1);
    stdoutSpy.mockRestore();
  });

  it("executes tool call and continues loop", async () => {
    const client = makeClient([
      {
        toolCalls: [{ id: "tc1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } }],
        content: null,
      },
      { toolCalls: [], content: "Tool executed successfully" },
    ]);

    const agent = new Agent(client, registry, history, {
      autoApprove: true,
      stream: false,
      debug: false,
    });

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await agent.run("Echo hi");

    expect(client.chatWithTools).toHaveBeenCalledTimes(2);
  });

  it("stops after max iterations", async () => {
    // Always return a tool call to force infinite loop
    const client = makeClient(
      Array.from({ length: 10 }, (_, i) => ({
        toolCalls: [{ id: `tc${i}`, type: "function" as const, function: { name: "echo", arguments: '{"text":"hi"}' } }],
        content: null,
      })),
    );

    const agent = new Agent(client, registry, history, {
      autoApprove: true,
      stream: false,
      debug: false,
      maxIterations: 3,
    });

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await agent.run("Loop forever");

    expect(client.chatWithTools).toHaveBeenCalledTimes(3);
  });

  it("handles unknown tool gracefully", async () => {
    const client = makeClient([
      {
        toolCalls: [{ id: "tc1", type: "function", function: { name: "nonexistent_tool", arguments: "{}" } }],
        content: null,
      },
      { toolCalls: [], content: "Handled error" },
    ]);

    const agent = new Agent(client, registry, history, {
      autoApprove: true,
      stream: false,
      debug: false,
    });

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Should not throw
    await expect(agent.run("Use unknown tool")).resolves.toBeUndefined();
  });

  it("adds user message to history", async () => {
    const client = makeClient([{ toolCalls: [], content: "Done" }]);

    const agent = new Agent(client, registry, history, {
      autoApprove: true,
      stream: false,
    });

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await agent.run("Test message");

    const messages = history.getAll();
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Test message");
  });
});
