import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WriteFileTool } from "../../src/tools/write_file.js";

describe("WriteFileTool", () => {
  const tool = new WriteFileTool();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-write-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates a new file", async () => {
    const filePath = path.join(tmpDir, "new.txt");
    const result = await tool.run({ path: filePath, content: "hello world" });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  it("overwrites existing file", async () => {
    const filePath = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(filePath, "old content");

    const result = await tool.run({ path: filePath, content: "new content" });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
  });

  it("creates parent directories", async () => {
    const filePath = path.join(tmpDir, "a", "b", "c.txt");
    const result = await tool.run({ path: filePath, content: "nested" });
    expect(result.success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("patches specific lines", async () => {
    const filePath = path.join(tmpDir, "patch.txt");
    fs.writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5");

    const result = await tool.run({
      path: filePath,
      content: "REPLACED2\nREPLACED3",
      start_line: 2,
      end_line: 3,
    });

    expect(result.success).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("line1");
    expect(content).toContain("REPLACED2");
    expect(content).toContain("REPLACED3");
    expect(content).toContain("line4");
    expect(content).not.toContain("line2");
    expect(content).not.toContain("line3");
  });

  it("returns error for patch on nonexistent file", async () => {
    const result = await tool.run({
      path: "/nonexistent/file.txt",
      content: "data",
      start_line: 1,
      end_line: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects path traversal", async () => {
    const result = await tool.run({ path: "\0badpath", content: "data" });
    expect(result.success).toBe(false);
  });
});
