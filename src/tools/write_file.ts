import fs from "node:fs";
import path from "node:path";
import { BaseTool, type ToolResult } from "./base.js";
import { sanitizePath } from "./read_file.js";
import type { JSONSchema } from "../agent/types.js";

export class WriteFileTool extends BaseTool {
  readonly name = "write_file";
  readonly description =
    "Write content to a file (full overwrite) or replace specific lines in an existing file (line-range patch).";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to write (absolute or relative to cwd)",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
      start_line: {
        type: "number",
        description: "For patching: first line to replace (1-indexed, inclusive)",
      },
      end_line: {
        type: "number",
        description: "For patching: last line to replace (1-indexed, inclusive)",
      },
      create_dirs: {
        type: "boolean",
        description: "Create parent directories if they don't exist (default: true)",
      },
    },
    required: ["path", "content"],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(args["path"] ?? "");
    const content = String(args["content"] ?? "");
    const startLine = typeof args["start_line"] === "number" ? args["start_line"] : undefined;
    const endLine = typeof args["end_line"] === "number" ? args["end_line"] : undefined;
    const createDirs = args["create_dirs"] !== false;

    if (!filePath) {
      return this.failure("path is required");
    }

    let resolvedPath: string;
    try {
      resolvedPath = sanitizePath(filePath);
    } catch (err) {
      return this.failure(String(err));
    }

    try {
      if (createDirs) {
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      if (startLine !== undefined || endLine !== undefined) {
        // Line-range patch mode
        if (!fs.existsSync(resolvedPath)) {
          return this.failure(`File not found for patching: ${resolvedPath}`);
        }

        const existing = fs.readFileSync(resolvedPath, "utf-8");
        const lines = existing.split("\n");
        const start = Math.max(1, startLine ?? 1) - 1;
        const end = Math.min(lines.length, endLine ?? lines.length);
        const newLines = content.split("\n");

        lines.splice(start, end - start, ...newLines);
        fs.writeFileSync(resolvedPath, lines.join("\n"), "utf-8");

        return this.success(
          `Patched ${resolvedPath}: replaced lines ${start + 1}-${end} with ${newLines.length} new line(s)`,
        );
      }

      // Full overwrite
      fs.writeFileSync(resolvedPath, content, "utf-8");
      const lineCount = content.split("\n").length;
      return this.success(`Written ${lineCount} line(s) to ${resolvedPath}`);
    } catch (err) {
      return this.failure(`Failed to write file: ${String(err)}`);
    }
  }
}
