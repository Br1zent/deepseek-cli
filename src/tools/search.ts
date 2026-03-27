import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseTool, type ToolResult } from "./base.js";
import { sanitizePath } from "./read_file.js";
import type { JSONSchema } from "../agent/types.js";

const execFileAsync = promisify(execFile);

async function hasRipgrep(): Promise<boolean> {
  try {
    await execFileAsync("rg", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export class SearchTool extends BaseTool {
  readonly name = "search";
  readonly description =
    "Search file contents using ripgrep (or grep as fallback). Supports regex patterns.";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Search pattern (regex supported)",
      },
      path: {
        type: "string",
        description: "Directory or file to search in (default: current directory)",
      },
      glob: {
        type: "string",
        description: "File glob pattern to filter (e.g. '*.ts', '*.{js,ts}')",
      },
      case_sensitive: {
        type: "boolean",
        description: "Case sensitive search (default: false)",
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (default: 50)",
      },
      context_lines: {
        type: "number",
        description: "Number of context lines before and after each match (default: 2)",
      },
    },
    required: ["pattern"],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(args["pattern"] ?? "");
    const searchPath = typeof args["path"] === "string" ? args["path"] : ".";
    const glob = typeof args["glob"] === "string" ? args["glob"] : undefined;
    const caseSensitive = args["case_sensitive"] === true;
    const maxResults = typeof args["max_results"] === "number" ? args["max_results"] : 50;
    const contextLines = typeof args["context_lines"] === "number" ? args["context_lines"] : 2;

    if (!pattern) {
      return this.failure("pattern is required");
    }

    let resolvedPath: string;
    try {
      resolvedPath = sanitizePath(searchPath);
    } catch (err) {
      return this.failure(String(err));
    }

    const useRg = await hasRipgrep();

    try {
      if (useRg) {
        return await this.runRipgrep(pattern, resolvedPath, {
          glob,
          caseSensitive,
          maxResults,
          contextLines,
        });
      } else {
        return await this.runGrep(pattern, resolvedPath, {
          caseSensitive,
          maxResults,
        });
      }
    } catch (err) {
      return this.failure(`Search failed: ${String(err)}`);
    }
  }

  private async runRipgrep(
    pattern: string,
    searchPath: string,
    opts: {
      glob?: string;
      caseSensitive: boolean;
      maxResults: number;
      contextLines: number;
    },
  ): Promise<ToolResult> {
    const args = [
      "--line-number",
      "--no-heading",
      `--context=${opts.contextLines}`,
      "--color=never",
    ];

    if (!opts.caseSensitive) args.push("--ignore-case");
    if (opts.glob) args.push(`--glob=${opts.glob}`);
    args.push(pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("rg", args, {
        maxBuffer: 10 * 1024 * 1024,
      });

      const lines = stdout.trim().split("\n").filter(Boolean);
      const limited = lines.slice(0, opts.maxResults * (opts.contextLines * 2 + 2));

      if (limited.length === 0) {
        return this.success(`No matches found for pattern: ${pattern}`);
      }

      return this.success(
        `Search results for "${pattern}" in ${searchPath}:\n\n${limited.join("\n")}`,
      );
    } catch (err: unknown) {
      const execErr = err as { code?: number; stdout?: string };
      // Exit code 1 means no matches found (not an error)
      if (execErr.code === 1) {
        return this.success(`No matches found for pattern: ${pattern}`);
      }
      throw err;
    }
  }

  private async runGrep(
    pattern: string,
    searchPath: string,
    opts: { caseSensitive: boolean; maxResults: number },
  ): Promise<ToolResult> {
    const args = ["-r", "-n", "--include=*"];
    if (!opts.caseSensitive) args.push("-i");
    args.push(pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("grep", args, {
        maxBuffer: 10 * 1024 * 1024,
      });

      const lines = stdout.trim().split("\n").filter(Boolean).slice(0, opts.maxResults);

      if (lines.length === 0) {
        return this.success(`No matches found for pattern: ${pattern}`);
      }

      return this.success(
        `Search results for "${pattern}" in ${searchPath} (grep):\n\n${lines.join("\n")}`,
      );
    } catch (err: unknown) {
      const execErr = err as { code?: number };
      if (execErr.code === 1) {
        return this.success(`No matches found for pattern: ${pattern}`);
      }
      throw err;
    }
  }
}
