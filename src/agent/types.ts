export type Role = "system" | "user" | "assistant" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCallContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type MessageContent = string | TextContent | ToolCallContent;

export interface Message {
  role: Role;
  content: MessageContent | MessageContent[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface APIMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  [key: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: APIMessage;
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: Usage;
}

export interface AgentState {
  messages: APIMessage[];
  iteration: number;
  done: boolean;
  totalTokens: number;
}

export interface AgentOptions {
  maxIterations?: number;
  autoApprove?: boolean;
  dryRun?: boolean;
  stream?: boolean;
  debug?: boolean;
  noWebSearch?: boolean;
  searchDepth?: "basic" | "advanced";
}
