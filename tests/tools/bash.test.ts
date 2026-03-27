import { describe, it, expect } from "vitest";
import { BashTool } from "../../src/tools/bash.js";

describe("BashTool", () => {
  const tool = new BashTool(5000);

  it("executes a simple command", async () => {
    const result = await tool.run({ command: "echo hello" });
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  it("captures stderr", async () => {
    const result = await tool.run({ command: "echo error >&2; exit 1" });
    expect(result.success).toBe(false);
    expect(result.output).toContain("error");
  });

  it("handles command not found", async () => {
    const result = await tool.run({ command: "this_command_does_not_exist_abc123" });
    expect(result.success).toBe(false);
  });

  it("times out slow commands", async () => {
    const shortTimeoutTool = new BashTool(100);
    const result = await shortTimeoutTool.run({ command: "sleep 5" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("returns error for empty command", async () => {
    const result = await tool.run({ command: "" });
    expect(result.success).toBe(false);
  });

  it("uses custom timeout from args", async () => {
    const result = await tool.run({ command: "echo test", timeout: 5000 });
    expect(result.success).toBe(true);
  });

  it("captures multi-line output", async () => {
    const result = await tool.run({ command: "printf 'line1\\nline2\\nline3'" });
    expect(result.success).toBe(true);
    expect(result.output).toContain("line1");
    expect(result.output).toContain("line2");
    expect(result.output).toContain("line3");
  });
});
