import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSearchTool } from "../../src/tools/web_search.js";

const MOCK_TAVILY_RESPONSE = {
  answer: "ECONNREFUSED means the connection was refused by the target server.",
  results: [
    {
      title: "Stack Overflow: ECONNREFUSED",
      url: "https://stackoverflow.com/questions/econnrefused",
      content: "The error occurs when the server is not listening on the port.",
      score: 0.95,
    },
    {
      title: "Node.js Docs",
      url: "https://nodejs.org/docs/errors",
      content: "ECONNREFUSED: No connection could be made.",
      score: 0.87,
    },
  ],
};

function mockFetch(response: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    }),
  );
}

describe("WebSearchTool", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns helpful error when tavilyApiKey is missing", async () => {
    const tool = new WebSearchTool({ tavilyApiKey: undefined, searchDepth: "basic" });
    const result = await tool.run({ query: "test query" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("deepseek config set tavily-key");
  });

  it("sends correct payload to Tavily", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_TAVILY_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test-key", searchDepth: "basic" });
    await tool.run({ query: "how to fix ECONNREFUSED", max_results: 3 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");

    const body = JSON.parse(options.body as string) as {
      api_key: string;
      query: string;
      max_results: number;
      search_depth: string;
      include_answer: boolean;
    };
    expect(body.api_key).toBe("tvly-test-key");
    expect(body.query).toBe("how to fix ECONNREFUSED");
    expect(body.max_results).toBe(3);
    expect(body.search_depth).toBe("basic");
    expect(body.include_answer).toBe(true);
  });

  it("formats results as readable markdown", async () => {
    mockFetch(MOCK_TAVILY_RESPONSE);

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    const result = await tool.run({ query: "ECONNREFUSED" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Web Search:");
    expect(result.output).toContain("Summary:");
    expect(result.output).toContain("ECONNREFUSED means");
    expect(result.output).toContain("Stack Overflow");
    expect(result.output).toContain("stackoverflow.com");
  });

  it("uses advanced search depth when deep=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_TAVILY_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    await tool.run({ query: "test", deep: true });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { search_depth: string };
    expect(body.search_depth).toBe("advanced");
  });

  it("clamps max_results to 1-10 range", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_TAVILY_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });

    // Test clamping to max 10
    await tool.run({ query: "test", max_results: 100 });
    let [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    let body = JSON.parse(options.body as string) as { max_results: number };
    expect(body.max_results).toBe(10);

    // Test clamping to min 1
    await tool.run({ query: "test", max_results: 0 });
    [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    body = JSON.parse(options.body as string) as { max_results: number };
    expect(body.max_results).toBe(1);
  });

  it("returns error for empty query", async () => {
    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    const result = await tool.run({ query: "" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("query is required");
  });

  it("handles Tavily API error gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-invalid", searchDepth: "basic" });
    const result = await tool.run({ query: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });

  it("handles network error gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    const result = await tool.run({ query: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("handles response without answer field", async () => {
    mockFetch({ results: MOCK_TAVILY_RESPONSE.results });

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    const result = await tool.run({ query: "test" });
    expect(result.success).toBe(true);
    expect(result.output).not.toContain("Summary:");
  });

  it("handles empty results", async () => {
    mockFetch({ answer: undefined, results: [] });

    const tool = new WebSearchTool({ tavilyApiKey: "tvly-test", searchDepth: "basic" });
    const result = await tool.run({ query: "very obscure query" });
    expect(result.success).toBe(true);
    expect(result.output).toContain("No results found");
  });
});
