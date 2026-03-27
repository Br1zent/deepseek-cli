import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReadFileTool, sanitizePath } from "../../src/tools/read_file.js";

describe("ReadFileTool", () => {
  const tool = new ReadFileTool();
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-test-"));
    testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "line1\nline2\nline3\nline4\nline5");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("reads a file successfully", async () => {
    const result = await tool.run({ path: testFile });
    expect(result.success).toBe(true);
    expect(result.output).toContain("line1");
    expect(result.output).toContain("line5");
  });

  it("reads file with line range", async () => {
    const result = await tool.run({ path: testFile, start_line: 2, end_line: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toContain("line2");
    expect(result.output).toContain("line3");
    expect(result.output).not.toContain("line1");
    expect(result.output).not.toContain("line5");
  });

  it("returns error for nonexistent file", async () => {
    const result = await tool.run({ path: "/nonexistent/file.txt" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error for empty path", async () => {
    const result = await tool.run({ path: "" });
    expect(result.success).toBe(false);
  });

  it("returns error for directory path", async () => {
    const result = await tool.run({ path: tmpDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a file");
  });

  it("includes line numbers in range read", async () => {
    const result = await tool.run({ path: testFile, start_line: 2, end_line: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/2:/);
    expect(result.output).toMatch(/3:/);
  });
});

describe("sanitizePath", () => {
  it("rejects paths with null bytes", () => {
    expect(() => sanitizePath("file\0.txt")).toThrow();
  });

  it("resolves relative paths", () => {
    const resolved = sanitizePath("./test.txt");
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  it("enforces baseDir containment", () => {
    const baseDir = "/tmp/safe";
    expect(() => sanitizePath("../../etc/passwd", baseDir)).toThrow();
  });
});
