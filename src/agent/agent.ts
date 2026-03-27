import * as readline from "node:readline";
import chalk from "chalk";
import type { DeepSeekClient } from "../api/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ConversationHistory } from "../context/conversation.js";
import { Spinner } from "../ui/spinner.js";
import {
  renderMarkdown,
  renderToolCall,
  renderUsage,
  renderError,
  renderWarn,
} from "../ui/renderer.js";
import { logger } from "../utils/logger.js";
import { APIError, ToolError } from "../utils/errors.js";
import type { AgentOptions, AgentState, APIMessage, ToolCall } from "./types.js";

const noColor = Boolean(process.env["NO_COLOR"]);

export class Agent {
  private readonly client: DeepSeekClient;
  private readonly registry: ToolRegistry;
  private readonly history: ConversationHistory;
  private readonly options: Required<AgentOptions>;
  private readonly spinner: Spinner;
  private abortController: AbortController | null = null;

  constructor(
    client: DeepSeekClient,
    registry: ToolRegistry,
    history: ConversationHistory,
    options: AgentOptions = {},
  ) {
    this.client = client;
    this.registry = registry;
    this.history = history;
    this.options = {
      maxIterations: options.maxIterations ?? 50,
      autoApprove: options.autoApprove ?? false,
      dryRun: options.dryRun ?? false,
      stream: options.stream ?? true,
      debug: options.debug ?? false,
      noWebSearch: options.noWebSearch ?? false,
      searchDepth: options.searchDepth ?? "basic",
    };
    this.spinner = new Spinner();
  }

  async run(userInput: string): Promise<void> {
    this.abortController = new AbortController();
    this.setupSignalHandler();

    this.history.add({ role: "user", content: userInput });

    const state: AgentState = {
      messages: this.history.getAll(),
      iteration: 0,
      done: false,
      totalTokens: 0,
    };

    const tools = this.registry.getDefinitions();
    const filteredTools = this.options.noWebSearch
      ? tools.filter((t) => t.function.name !== "web_search")
      : tools;

    try {
      while (!state.done && state.iteration < this.options.maxIterations) {
        state.iteration++;

        if (this.abortController.signal.aborted) {
          console.error(renderWarn("Aborted by user."));
          break;
        }

        this.spinner.start(
          `Thinking... (iteration ${state.iteration}/${this.options.maxIterations})`,
        );

        let response: { toolCalls: ToolCall[]; content: string | null; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };

        try {
          response = await this.client.chatWithTools(state.messages, filteredTools);
        } catch (err) {
          this.spinner.fail("API request failed");
          if (err instanceof APIError) {
            console.error(renderError(err.message));
          } else {
            console.error(renderError(String(err)));
          }
          break;
        }

        this.spinner.stop();

        if (response.usage) {
          state.totalTokens += response.usage.total_tokens;
          if (this.options.debug) {
            console.error(renderUsage(response.usage));
          }
        }

        const assistantMessage: APIMessage = {
          role: "assistant",
          content: response.content ?? null,
          tool_calls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        };

        state.messages.push(assistantMessage);
        this.history.add(assistantMessage);

        // Text response — stream to terminal, end loop
        if (response.toolCalls.length === 0) {
          const text = response.content ?? "";
          if (text) {
            if (this.options.stream) {
              await this.streamText(text);
            } else {
              process.stdout.write(renderMarkdown(text) + "\n");
            }
          }
          state.done = true;
          break;
        }

        // Tool calls
        for (const toolCall of response.toolCalls) {
          if (this.abortController.signal.aborted) break;

          await this.handleToolCall(toolCall, state);
        }
      }

      if (state.iteration >= this.options.maxIterations && !state.done) {
        console.error(
          renderWarn(
            `Reached maximum iterations (${this.options.maxIterations}). Stopping.`,
          ),
        );
      }
    } finally {
      this.spinner.stop();
      this.removeSignalHandler();
    }
  }

  private async handleToolCall(toolCall: ToolCall, state: AgentState): Promise<void> {
    const { name, arguments: argsStr } = toolCall.function;

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {
      args = { raw: argsStr };
    }

    // Display tool call
    console.error("\n" + renderToolCall(name, args, "pending"));

    // Confirmation
    if (!this.options.autoApprove && !this.options.dryRun) {
      const confirmed = await this.promptConfirmation(name, args);
      if (!confirmed) {
        const skipMessage: APIMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Tool execution was skipped by the user.",
        };
        state.messages.push(skipMessage);
        this.history.add(skipMessage);
        console.error(renderToolCall(name, args, "skipped"));
        return;
      }
    }

    if (this.options.dryRun) {
      console.error(noColor ? "[DRY RUN] Tool not executed" : chalk.gray("[DRY RUN] Tool not executed"));
      const dryMessage: APIMessage = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: "[DRY RUN] Tool was not executed.",
      };
      state.messages.push(dryMessage);
      this.history.add(dryMessage);
      return;
    }

    // Execute tool
    let toolResultContent: string;
    try {
      const result = await this.registry.run(name, args);
      toolResultContent = result.success
        ? result.output
        : `Error: ${result.error ?? "Unknown error"}\n${result.output}`.trim();

      console.error(
        renderToolCall(name, args, result.success ? "success" : "error"),
      );

      if (result.error && !result.success) {
        console.error(renderError(result.error));
      }

      logger.debug(`Tool ${name} result: ${toolResultContent.slice(0, 200)}`);
    } catch (err) {
      if (err instanceof ToolError) {
        toolResultContent = `Tool error: ${err.message}`;
      } else {
        toolResultContent = `Unexpected error: ${String(err)}`;
      }
      console.error(renderToolCall(name, args, "error"));
      console.error(renderError(toolResultContent));
    }

    const toolMessage: APIMessage = {
      role: "tool",
      tool_call_id: toolCall.id,
      content: toolResultContent,
    };

    state.messages.push(toolMessage);
    this.history.add(toolMessage);
  }

  private async streamText(text: string): Promise<void> {
    // For non-streaming mode (we get full text from chatWithTools)
    // Simulate streaming for better UX
    const rendered = renderMarkdown(text);
    process.stdout.write(rendered);
    if (!rendered.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }

  private async promptConfirmation(
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      });

      const prompt = noColor
        ? `\nExecute ${toolName}? [Y/n] `
        : chalk.yellow(`\nExecute ${chalk.bold(toolName)}? [Y/n] `);

      rl.question(prompt, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === "" || normalized === "y" || normalized === "yes");
      });
    });
  }

  private sigintHandler: (() => void) | null = null;

  private setupSignalHandler(): void {
    this.sigintHandler = () => {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.spinner.stop();
      console.error("\n" + renderWarn("Interrupted. Press Ctrl+C again to exit."));

      // Second Ctrl+C exits
      process.once("SIGINT", () => {
        console.error("\nExiting.");
        process.exit(0);
      });
    };
    process.once("SIGINT", this.sigintHandler);
  }

  private removeSignalHandler(): void {
    if (this.sigintHandler) {
      process.removeListener("SIGINT", this.sigintHandler);
      this.sigintHandler = null;
    }
  }
}
