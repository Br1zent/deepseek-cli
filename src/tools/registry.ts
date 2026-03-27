import type { ToolDefinition } from "../agent/types.js";
import type { BaseTool, ToolResult } from "./base.js";
import { ToolError } from "../utils/errors.js";

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.toDefinition());
  }

  async run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(`Unknown tool: ${name}`, name);
    }
    return tool.run(args);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
