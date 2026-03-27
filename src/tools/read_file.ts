import fs from "node:fs";
import path from "node:path";
import { BaseTool, type ToolResult } from "./base.js";
import { PathTraversalError } from "../utils/errors.js";
import type { JSONSchema } from "../agent/types.js";

export function sanitizePath(filePath: string, baseDir?: string): string {
  const resolved = path.resolve(baseDir ?? process.cwd(), filePath);
  const base = path.resolve(baseDir ?? process.cwd());

  // Allow absolute paths but prevent traversal that goes outside reasonable boundaries
  // Block null bytes and suspicious patterns
  if (filePath.includes("\0")) {
    throw new PathTraversalError(filePath);
  }

  // If baseDir provided, enforce containment
  if (baseDir && !resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new PathTraversalError(filePath);
  }

  return resolved;
}

export class ReadFileTool extends BaseTool {
  readonly name = "read_file";
  readonly description =
    "Read the contents of a file. Optionally specify a line range to read only part of a file.";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to read (absolute or relative to cwd)",
      },
      start_line: {
        type: "number",
        description: "First line to read (1-indexed, inclusive)",
      },
      end_line: {
        type: "number",
        description: "Last line to read (1-indexed, inclusive)",
      },
    },
    required: ["path"],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(args["path"] ?? "");
    const startLine = typeof args["start_line"] === "number" ? args["start_line"] : undefined;
    const endLine = typeof args["end_line"] === "number" ? args["end_line"] : undefined;

    if (!filePath) {
      return this.failure("path is required");
    }

    let resolvedPath: string;
    try {
      resolvedPath = sanitizePath(filePath);
    } catch (err) {
      return this.failure(String(err));
    }

    if (!fs.existsSync(resolvedPath)) {
      return this.failure(`File not found: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return this.failure(`Not a file: ${resolvedPath}`);
    }

    // Warn for large files
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (stat.size > MAX_SIZE && !startLine) {
      return this.failure(
        `File is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use start_line/end_line to read a specific range.`,
      );
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split("\n");
        const start = Math.max(1, startLine ?? 1) - 1;
        const end = Math.min(lines.length, endLine ?? lines.length);
        const slice = lines.slice(start, end);
        const numbered = slice
          .map((line, i) => `${start + i + 1}: ${line}`)
          .join("\n");
        return this.success(
          `File: ${resolvedPath} (lines ${start + 1}-${end})\n\n${numbered}`,
        );
      }

      return this.success(`File: ${resolvedPath}\n\n${content}`);
    } catch (err) {
      return this.failure(`Failed to read file: ${String(err)}`);
    }
  }
}
