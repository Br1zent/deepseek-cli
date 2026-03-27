import type { APIMessage } from "../agent/types.js";

export interface ConversationOptions {
  maxMessages?: number;
  systemPrompt?: string;
}

const DEFAULT_MAX_MESSAGES = 100;

export class ConversationHistory {
  private messages: APIMessage[] = [];
  private readonly maxMessages: number;
  private readonly systemPrompt: string;

  constructor(options: ConversationOptions = {}) {
    this.maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.systemPrompt = options.systemPrompt ?? getDefaultSystemPrompt();
  }

  getSystemMessage(): APIMessage {
    return { role: "system", content: this.systemPrompt };
  }

  add(message: APIMessage): void {
    this.messages.push(message);
    this.trim();
  }

  addAll(messages: APIMessage[]): void {
    this.messages.push(...messages);
    this.trim();
  }

  getAll(): APIMessage[] {
    return [this.getSystemMessage(), ...this.messages];
  }

  getRecent(n: number): APIMessage[] {
    return [this.getSystemMessage(), ...this.messages.slice(-n)];
  }

  clear(): void {
    this.messages = [];
  }

  get length(): number {
    return this.messages.length;
  }

  private trim(): void {
    if (this.messages.length > this.maxMessages) {
      // Keep first few messages for context + most recent
      const keep = Math.floor(this.maxMessages * 0.8);
      this.messages = this.messages.slice(-keep);
    }
  }

  replaceLast(message: APIMessage): void {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1] = message;
    }
  }
}

function getDefaultSystemPrompt(): string {
  const date = new Date().toISOString().split("T")[0];
  return `You are DeepSeek CLI, an AI coding assistant running in the terminal. Today's date is ${date}.

You help developers by:
- Writing, reading, and modifying code files
- Running shell commands and scripts
- Searching codebases and the web
- Explaining code and debugging issues

When you need to perform actions, use the available tools. Always think step by step.
Be concise and precise. Prefer showing code over lengthy explanations.
When modifying files, always read them first to understand the current state.`;
}
