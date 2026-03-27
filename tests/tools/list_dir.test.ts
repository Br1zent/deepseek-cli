import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ListDirTool } from "../../src/tools/list_dir.js";

describe("ListDirTool", () => {
  const tool = new ListDirTool();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-list-test-"));
    fs.writeFileSync(path.join(tmpDir, "file1.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "file2.js"), "");
    fs.mkdirSync(path.join(tmpDir, "subdir"));
    fs.writeFileSync(path.join(tmpDir, "subdir", "nested.ts"), "");
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg.js"), "");
    fs.writeFileSync(path.join(tmpDir, ".hidden"), "");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("lists directory contents", async () => {
    const result = await tool.run({ path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain("file1.ts");
    expect(result.output).toContain("file2.js");
    expect(result.output).toContain("subdir");
  });

  it("excludes node_modules by default", async () => {
    const result = await tool.run({ path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).not.toContain("node_modules");
  });

  it("excludes hidden files by default", async () => {
    const result = await tool.run({ path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).not.toContain(".hidden");
  });

  it("shows hidden files when requested", async () => {
    const result = await tool.run({ path: tmpDir, show_hidden: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain(".hidden");
  });

  it("shows nested files", async () => {
    const result = await tool.run({ path: tmpDir });
    expect(result.success).toBe(true);
    expect(result.output).toContain("nested.ts");
  });

  it("returns error for nonexistent directory", async () => {
    const result = await tool.run({ path: "/nonexistent/dir" });
    expect(result.success).toBe(false);
  });

  it("returns error for file path", async () => {
    const filePath = path.join(tmpDir, "file1.ts");
    const result = await tool.run({ path: filePath });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a directory");
  });

  it("respects max_depth", async () => {
    const result = await tool.run({ path: tmpDir, max_depth: 1 });
    expect(result.success).toBe(true);
    // At depth 1 we should see subdir but not its contents
    expect(result.output).toContain("subdir");
  });

  it("uses current directory as default", async () => {
    const result = await tool.run({});
    expect(result.success).toBe(true);
  });
});
