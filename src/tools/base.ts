import type { JSONSchema, ToolDefinition } from "../agent/types.js";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: JSONSchema;

  abstract run(args: Record<string, unknown>): Promise<ToolResult>;

  toDefinition(): ToolDefinition {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  protected success(output: string): ToolResult {
    return { success: true, output };
  }

  protected failure(error: string): ToolResult {
    return { success: false, output: "", error };
  }
}
