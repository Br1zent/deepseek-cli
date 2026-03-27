import { z } from "zod";
import { BaseTool, type ToolResult } from "./base.js";
import type { JSONSchema } from "../agent/types.js";
import type { Config } from "../config/schema.js";

const TavilyResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
});

const TavilyResponseSchema = z.object({
  answer: z.string().optional(),
  results: z.array(TavilyResultSchema),
});

type TavilyResponse = z.infer<typeof TavilyResponseSchema>;

export class WebSearchTool extends BaseTool {
  readonly name = "web_search";
  readonly description =
    "Search the internet for current information, documentation, news, or any topic. Returns structured results with an AI-generated summary.";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query. Be specific for better results.",
      },
      max_results: {
        type: "number",
        description: "Number of results to return (1–10, default 5)",
      },
      deep: {
        type: "boolean",
        description:
          "Use advanced search for thorough research (slower, costs more API credits)",
      },
    },
    required: ["query"],
  };

  private readonly config: Pick<Config, "tavilyApiKey" | "searchDepth">;

  constructor(config: Pick<Config, "tavilyApiKey" | "searchDepth">) {
    super();
    this.config = config;
  }

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args["query"] ?? "").trim();
    const rawMaxResults = typeof args["max_results"] === "number" ? args["max_results"] : 5;
    const maxResults = Math.min(10, Math.max(1, rawMaxResults));
    const deep = args["deep"] === true;

    if (!query) {
      return this.failure("query is required");
    }

    if (!this.config.tavilyApiKey) {
      return this.failure(
        "Web search is not configured. Run:\n  deepseek config set tavily-key <your-key>\nor set the TAVILY_API_KEY environment variable.",
      );
    }

    const searchDepth = deep ? "advanced" : (this.config.searchDepth ?? "basic");

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.config.tavilyApiKey,
          query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        return this.failure(`Tavily API error ${response.status}: ${text}`);
      }

      const raw: unknown = await response.json();
      const parsed = TavilyResponseSchema.safeParse(raw);

      if (!parsed.success) {
        return this.failure(
          `Unexpected Tavily response format: ${parsed.error.message}`,
        );
      }

      return this.success(this.formatResults(query, parsed.data));
    } catch (err) {
      return this.failure(`Web search failed: ${String(err)}`);
    }
  }

  private formatResults(query: string, data: TavilyResponse): string {
    const lines: string[] = [];
    lines.push(`Web Search: "${query}"\n`);

    if (data.answer) {
      lines.push(`Summary: ${data.answer}\n`);
    }

    if (data.results.length === 0) {
      lines.push("No results found.");
      return lines.join("\n");
    }

    lines.push("Results:");
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      if (!r) continue;
      lines.push(`${i + 1}. [${r.title}]`);
      lines.push(`   ${r.url}`);
      lines.push(`   ${r.content}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
