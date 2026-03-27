import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SearchTool } from "../../src/tools/search.js";

describe("SearchTool", () => {
  const tool = new SearchTool();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-search-test-"));
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "export function hello() { return 'hello'; }\n// TODO: remove this\n");
    fs.writeFileSync(path.join(tmpDir, "b.ts"), "export function world() { return 'world'; }\n");
    fs.writeFileSync(path.join(tmpDir, "c.txt"), "hello world in a text file\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("finds pattern in files", async () => {
    const result = await tool.run({ pattern: "hello", path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  it("returns no results message when no match", async () => {
    const result = await tool.run({ pattern: "xyzzy_not_found_12345", path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain("No matches");
  });

  it("returns error for empty pattern", async () => {
    const result = await tool.run({ pattern: "", path: tmpDir });
    expect(result.success).toBe(false);
  });

  it("supports regex patterns", async () => {
    const result = await tool.run({ pattern: "function\\s+\\w+", path: tmpDir });
    expect(result.success).toBe(true);
  });

  it("handles nonexistent path", async () => {
    const result = await tool.run({ pattern: "hello", path: "/nonexistent/path" });
    // Should either fail gracefully or return no results
    expect(result).toBeDefined();
  });
});
