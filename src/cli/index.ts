import * as readline from "node:readline";
import * as fs from "node:fs";
import chalk from "chalk";
import { parseArgs } from "./args.js";
import { loadConfig, saveConfigValue, showConfig } from "../config/loader.js";
import { DeepSeekClient } from "../api/client.js";
import { Agent } from "../agent/agent.js";
import { ToolRegistry } from "../tools/registry.js";
import { BashTool } from "../tools/bash.js";
import { ReadFileTool } from "../tools/read_file.js";
import { WriteFileTool } from "../tools/write_file.js";
import { ListDirTool } from "../tools/list_dir.js";
import { SearchTool } from "../tools/search.js";
import { WebSearchTool } from "../tools/web_search.js";
import { ConversationHistory } from "../context/conversation.js";
import { logger } from "../utils/logger.js";
import { renderError, renderInfo, renderPrompt, renderDivider } from "../ui/renderer.js";
import { ConfigError } from "../utils/errors.js";

const noColor = Boolean(process.env["NO_COLOR"]);

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArgs>;

  try {
    args = parseArgs(process.argv);
  } catch (err: unknown) {
    if (err instanceof Error && "exitCode" in err) {
      // Commander already printed the error
      process.exit(1);
    }
    console.error(renderError(String(err)));
    process.exit(1);
  }

  // Handle config subcommands before loading config (api-key might not be set yet)
  if (args.config) {
    if (args.config.action === "set" && args.config.key && args.config.value) {
      try {
        saveConfigValue(args.config.key, args.config.value);
        const keyLabel = args.config.key.includes("key")
          ? args.config.key.replace(/./g, "*").slice(0, 8) + "..."
          : args.config.value;
        console.log(renderInfo(`✓ Config updated: ${args.config.key} = ${keyLabel}`));
      } catch (err) {
        console.error(renderError(String(err)));
        process.exit(1);
      }
      return;
    }

    if (args.config.action === "show") {
      try {
        const config = loadConfig(args.provider ? { provider: args.provider } : {});
        showConfig(config);
      } catch (err) {
        if (err instanceof ConfigError) {
          console.error(renderError(err.message));
          process.exit(1);
        }
        throw err;
      }
      return;
    }
  }

  // Load configuration
  let config;
  try {
    config = loadConfig({
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.maxTokens ? { maxTokens: args.maxTokens } : {}),
      ...(args.debug ? { debug: true } : {}),
      ...(args.noStream ? { stream: false } : {}),
      ...(args.yes ? { autoApprove: true } : {}),
      ...(args.dryRun ? { dryRun: true } : {}),
      ...(args.searchDepth ? { searchDepth: args.searchDepth } : {}),
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(renderError(err.message));
      process.exit(1);
    }
    throw err;
  }

  if (config.debug) {
    logger.setLevel("debug");
  }

  // Build tool registry
  const registry = new ToolRegistry();
  registry.register(new BashTool(config.bashTimeout));
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new ListDirTool());
  registry.register(new SearchTool());

  if (config.webSearchEnabled && !args.noWebSearch) {
    registry.register(new WebSearchTool({
      tavilyApiKey: config.tavilyApiKey,
      searchDepth: config.searchDepth,
    }));
  }

  // Build client
  const client = new DeepSeekClient({
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    baseUrl: config.baseUrl,
  });

  // Build conversation history
  const history = new ConversationHistory();

  // Build agent
  const agent = new Agent(client, registry, history, {
    maxIterations: config.maxIterations,
    autoApprove: config.autoApprove,
    dryRun: config.dryRun,
    stream: config.stream,
    debug: config.debug,
    noWebSearch: args.noWebSearch,
    searchDepth: config.searchDepth,
  });

  // Check for piped input
  const hasPipedInput = !process.stdin.isTTY;

  // Single prompt mode (argument or piped)
  if (args.prompt || hasPipedInput) {
    let prompt = args.prompt ?? "";

    if (hasPipedInput) {
      const piped = await readStdin();
      if (piped) {
        prompt = prompt ? `${prompt}\n\n${piped}` : piped;
      }
    }

    if (!prompt.trim()) {
      console.error(renderError("No prompt provided"));
      process.exit(1);
    }

    await agent.run(prompt);
    return;
  }

  // Interactive REPL mode
  console.log(
    noColor
      ? "DeepSeek CLI — type your message, Ctrl+C or 'exit' to quit"
      : chalk.bold.cyan("DeepSeek CLI") +
          chalk.gray(" — type your message, Ctrl+C or 'exit' to quit"),
  );
  console.log(renderDivider());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  const askQuestion = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  while (true) {
    let input: string;
    try {
      input = await askQuestion(renderPrompt());
    } catch {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      console.log("Goodbye!");
      break;
    }

    console.log(renderDivider());

    try {
      await agent.run(trimmed);
    } catch (err) {
      console.error(renderError(err instanceof Error ? err.message : String(err)));
    }

    console.log(renderDivider());
  }

  rl.close();
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8").trim()));
    process.stdin.on("error", () => resolve(""));
  });
}

main().catch((err) => {
  console.error(renderError(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
