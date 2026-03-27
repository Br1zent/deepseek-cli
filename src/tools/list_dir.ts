import fs from "node:fs";
import path from "node:path";
import { BaseTool, type ToolResult } from "./base.js";
import { sanitizePath } from "./read_file.js";
import type { JSONSchema } from "../agent/types.js";

// Common patterns from .gitignore
const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "*.pyc",
  ".DS_Store",
  "Thumbs.db",
]);

function parseGitignore(dir: string): Set<string> {
  const gitignorePath = path.join(dir, ".gitignore");
  const patterns = new Set<string>(DEFAULT_IGNORE);

  if (!fs.existsSync(gitignorePath)) return patterns;

  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        // Strip trailing slashes for directory patterns
        patterns.add(trimmed.replace(/\/$/, ""));
      }
    }
  } catch { /* ignore */ }

  return patterns;
}

function isIgnored(name: string, patterns: Set<string>, hideHidden: boolean): boolean {
  // Hidden files (starting with .)
  if (hideHidden && name.startsWith(".")) return true;
  if (patterns.has(name)) return true;
  // Simple glob: *.ext patterns
  for (const pattern of patterns) {
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    }
  }
  return false;
}

function buildTree(
  dirPath: string,
  prefix: string,
  maxDepth: number,
  currentDepth: number,
  patterns: Set<string>,
  hideHidden: boolean,
  lines: string[],
): void {
  if (currentDepth > maxDepth) {
    lines.push(`${prefix}... (max depth reached)`);
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    lines.push(`${prefix}[Permission denied]`);
    return;
  }

  const filtered = entries
    .filter((e) => !isIgnored(e.name, patterns, hideHidden))
    .sort((a, b) => {
      // Directories first
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    if (!entry) continue;
    const isLast = i === filtered.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);
      buildTree(
        path.join(dirPath, entry.name),
        prefix + childPrefix,
        maxDepth,
        currentDepth + 1,
        patterns,
        hideHidden,
        lines,
      );
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }
}

export class ListDirTool extends BaseTool {
  readonly name = "list_dir";
  readonly description =
    "List directory contents as a tree. Respects .gitignore patterns and ignores common build/dependency directories.";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path to list (default: current directory)",
      },
      max_depth: {
        type: "number",
        description: "Maximum depth to traverse (default: 4)",
      },
      show_hidden: {
        type: "boolean",
        description: "Show hidden files/directories starting with . (default: false)",
      },
    },
    required: [],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = typeof args["path"] === "string" ? args["path"] : ".";
    const maxDepth = typeof args["max_depth"] === "number" ? args["max_depth"] : 4;
    const showHidden = args["show_hidden"] === true;

    let resolvedPath: string;
    try {
      resolvedPath = sanitizePath(dirPath);
    } catch (err) {
      return this.failure(String(err));
    }

    if (!fs.existsSync(resolvedPath)) {
      return this.failure(`Directory not found: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return this.failure(`Not a directory: ${resolvedPath}`);
    }

    const patterns = parseGitignore(resolvedPath);

    const lines: string[] = [`${resolvedPath}/`];
    buildTree(resolvedPath, "", maxDepth, 1, patterns, !showHidden, lines);

    return this.success(lines.join("\n"));
  }
}
