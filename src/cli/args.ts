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

export function parseArgs(argv: string[]): ParsedArgs {
  const program = new Command();

  program
    .name("deepseek")
    .description("DeepSeek CLI — terminal AI coding assistant")
    .version("1.0.0")
    .argument("[prompt]", "Prompt to send (omit for interactive REPL mode)")
    .option(
      "-p, --provider <provider>",
      `AI provider to use (${PROVIDERS.join(", ")})`,
      (val: string) => {
        if (!(PROVIDERS as readonly string[]).includes(val)) {
          throw new Error(`--provider must be one of: ${PROVIDERS.join(", ")}`);
        }
        return val as Provider;
      },
    )
    .option("-m, --model <model>", "Model to use (e.g. deepseek-chat, llama-3.3-70b-versatile)")
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
    .allowExcessArguments(false)
    .exitOverride();

  const configCmd = new Command("config").description("Manage configuration");

  const configSet = new Command("set")
    .description("Set a configuration value")
    .argument("<key>", "Config key (e.g. api-key, groq-key, tavily-key, model, provider)")
    .argument("<value>", "Config value")
    .exitOverride();

  const configShow = new Command("show")
    .description("Show current configuration")
    .exitOverride();

  configCmd.addCommand(configSet);
  configCmd.addCommand(configShow);
  program.addCommand(configCmd);

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

  const args = program.args;

  // Handle config subcommand
  if (argv.includes("config")) {
    const configIdx = argv.indexOf("config");
    const sub = argv[configIdx + 1];

    if (sub === "show") {
      return {
        provider: opts.provider,
        yes: false,
        noStream: false,
        debug: false,
        noWebSearch: false,
        dryRun: false,
        config: { action: "show" },
      };
    }

    if (sub === "set") {
      const key = argv[configIdx + 2];
      const value = argv[configIdx + 3];
      if (!key || !value) {
        console.error("Usage: deepseek config set <key> <value>");
        process.exit(1);
      }
      return {
        provider: opts.provider,
        yes: false,
        noStream: false,
        debug: false,
        noWebSearch: false,
        dryRun: false,
        config: { action: "set", key, value },
      };
    }
  }

  return {
    prompt: args[0],
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
