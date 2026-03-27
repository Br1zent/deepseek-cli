import { Command } from "commander";
import { PROVIDERS, type Provider } from "../config/schema.js";

export interface ParsedArgs {
  prompt?: string;
  provider?: Provider;
  model?: string;
  yes: boolean;
  noStream: boolean;
  maxTokens?: number;
  debug: boolean;
  noWebSearch: boolean;
  searchDepth?: "basic" | "advanced";
  dryRun: boolean;
  config?: {
    action: "set" | "show";
    key?: string;
    value?: string;
  };
}

/**
 * Check if argv is a `config` subcommand BEFORE handing off to commander.
 * This prevents commander from seeing subcommands and auto-printing help.
 */
function tryParseConfigSubcommand(argv: string[]): ParsedArgs | null {
  // Find "config" in args (skip node and script path)
  const args = argv.slice(2);
  const configIdx = args.indexOf("config");
  if (configIdx === -1) return null;

  // Collect any flags before "config" to get provider
  let provider: Provider | undefined;
  for (let i = 0; i < configIdx; i++) {
    const a = args[i];
    if ((a === "-p" || a === "--provider") && args[i + 1]) {
      const val = args[i + 1];
      if ((PROVIDERS as readonly string[]).includes(val ?? "")) {
        provider = val as Provider;
      }
    }
  }

  const sub = args[configIdx + 1];

  if (sub === "show") {
    return { provider, yes: false, noStream: false, debug: false, noWebSearch: false, dryRun: false, config: { action: "show" } };
  }

  if (sub === "set") {
    const key   = args[configIdx + 2];
    const value = args[configIdx + 3];
    if (!key || !value) {
      console.error("Usage: deepseek config set <key> <value>");
      process.exit(1);
    }
    return { provider, yes: false, noStream: false, debug: false, noWebSearch: false, dryRun: false, config: { action: "set", key, value } };
  }

  // `deepseek config` with no sub → show help for config
  console.log("Usage:");
  console.log("  deepseek config show");
  console.log("  deepseek config set <key> <value>");
  console.log("\nKeys: api-key, groq-key, tavily-key, provider, model, max-tokens, temperature, base-url, bash-timeout, max-iterations");
  process.exit(0);
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Handle config subcommand before commander sees it
  const configResult = tryParseConfigSubcommand(argv);
  if (configResult) return configResult;

  const program = new Command();

  program
    .name("deepseek")
    .description("DeepSeek CLI — terminal AI coding assistant")
    .version("1.0.0", "-V, --version")
    .argument("[prompt]", "Prompt to send (omit for interactive REPL mode)")
    .option(
      "-p, --provider <provider>",
      `AI provider: ${PROVIDERS.join(", ")}`,
      (val: string) => {
        if (!(PROVIDERS as readonly string[]).includes(val)) {
          throw new Error(`--provider must be one of: ${PROVIDERS.join(", ")}`);
        }
        return val as Provider;
      },
    )
    .option("-m, --model <model>", "Model to use")
    .option("-y, --yes", "Auto-approve all tool executions", false)
    .option("--no-stream", "Disable streaming output")
    .option("--max-tokens <n>", "Maximum tokens per response", parseInt)
    .option("--debug", "Enable verbose debug logging", false)
    .option("--no-web-search", "Disable web search tool for this session")
    .option(
      "--search-depth <depth>",
      "Web search depth: basic or advanced",
      (val: string) => {
        if (val !== "basic" && val !== "advanced") {
          throw new Error("--search-depth must be 'basic' or 'advanced'");
        }
        return val as "basic" | "advanced";
      },
    )
    .option("--dry-run", "Plan tools but don't execute them", false)
    .addHelpCommand(false)       // no auto "help" subcommand
    .exitOverride();

  program.parse(argv);

  const opts = program.opts<{
    provider?: Provider;
    model?: string;
    yes: boolean;
    stream: boolean;
    maxTokens?: number;
    debug: boolean;
    webSearch: boolean;
    searchDepth?: "basic" | "advanced";
    dryRun: boolean;
  }>();

  return {
    prompt: program.args[0],
    provider: opts.provider,
    model: opts.model,
    yes: opts.yes,
    noStream: !opts.stream,
    maxTokens: opts.maxTokens,
    debug: opts.debug,
    noWebSearch: !opts.webSearch,
    searchDepth: opts.searchDepth,
    dryRun: opts.dryRun,
  };
}
