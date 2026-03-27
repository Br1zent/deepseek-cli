import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepSeekClient } from "../../src/api/client.js";
import { APIError } from "../../src/utils/errors.js";

const defaultConfig = {
  apiKey: "sk-test",
  model: "deepseek-chat",
  maxTokens: 1024,
  temperature: 0,
  baseUrl: "https://api.deepseek.com/v1",
};

function makeMockFetch(responseData: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: () => null },
    json: async () => responseData,
    body: null,
  }) as unknown as typeof fetch;
}

describe("DeepSeekClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct Authorization header", async () => {
    const fetchMock = makeMockFetch({
      id: "1",
      object: "chat.completion",
      created: 1,
      model: "deepseek-chat",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new DeepSeekClient(defaultConfig);
    await client.chat([{ role: "user", content: "hello" }]);

    const [, options] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
  });

  it("returns text content from chat()", async () => {
    vi.stubGlobal(
      "fetch",
      makeMockFetch({
        choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      }),
    );

    const client = new DeepSeekClient(defaultConfig);
    const result = await client.chat([{ role: "user", content: "hi" }]);
    expect(result).toBe("Hello!");
  });

  it("throws APIError on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: { get: () => null },
        json: async () => ({ error: { message: "Invalid API key" } }),
      }),
    );

    const client = new DeepSeekClient(defaultConfig);
    await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow(APIError);
  });

  it("throws APIError with status code", async () => {
    // Use retry-after: "0" to avoid waiting in retry backoff
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: (h: string) => (h === "retry-after" ? "0" : null) },
        json: async () => ({ error: { message: "Rate limited" } }),
      }),
    );

    const client = new DeepSeekClient(defaultConfig);
    try {
      await client.chat([{ role: "user", content: "hi" }]);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(APIError);
      if (err instanceof APIError) {
        expect(err.statusCode).toBe(429);
      }
    }
  });

  it("returns tool calls from chatWithTools()", async () => {
    vi.stubGlobal(
      "fetch",
      makeMockFetch({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "tc1",
                  type: "function",
                  function: { name: "bash", arguments: '{"command":"ls"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
    );

    const client = new DeepSeekClient(defaultConfig);
    const result = await client.chatWithTools(
      [{ role: "user", content: "list files" }],
      [],
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("bash");
    expect(result.usage?.total_tokens).toBe(30);
  });
});
