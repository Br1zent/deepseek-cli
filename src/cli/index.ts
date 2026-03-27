import * as readline from "node:readline";
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
import { saveSession, loadSession, listSessions } from "../context/sessions.js";
import { logger } from "../utils/logger.js";
import {
  renderError,
  renderInfo,
  renderSuccess,
  renderWarn,
  renderPrompt,
  renderDivider,
  renderMarkdown,
} from "../ui/renderer.js";
import { printBanner, printHelp } from "../ui/banner.js";
import { ConfigError } from "../utils/errors.js";
import type { Config } from "../config/schema.js";
import { PROVIDERS } from "../config/schema.js";

const noColor = Boolean(process.env["NO_COLOR"]);
const VERSION = "1.0.0";

// ── Helpers ────────────────────────────────────────────────────────────────

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8").trim()));
    process.stdin.on("error", () => resolve(""));
  });
}

// ── First-run setup wizard ─────────────────────────────────────────────────

async function runSetupWizard(rl: readline.Interface): Promise<void> {
  console.log(noColor ? "\n=== Первоначальная настройка ===" : chalk.bold.cyan("\n╔═══ Первоначальная настройка ═══╗"));
  console.log(chalk.gray("Выбери провайдер и введи API ключ.\n"));

  // Provider selection
  console.log("Провайдеры:");
  console.log(noColor ? "  1. DeepSeek (deepseek-chat, deepseek-reasoner)" : `  ${chalk.cyan("1.")} DeepSeek  ${chalk.gray("deepseek-chat, deepseek-reasoner")}`);
  console.log(noColor ? "  2. Groq     (llama-3.3-70b, mixtral и др.)"     : `  ${chalk.cyan("2.")} Groq      ${chalk.gray("llama-3.3-70b-versatile, mixtral-8x7b-32768")}`);
  console.log();

  const choice = (await ask(rl, noColor ? "Провайдер [1/2] (Enter = 1): " : chalk.cyan("Провайдер [1/2] ") + chalk.gray("(Enter = 1): "))).trim();
  const provider = choice === "2" ? "groq" : "deepseek";
  saveConfigValue("provider", provider);

  // API key
  const keyHint = provider === "groq"
    ? "https://console.groq.com/keys"
    : "https://platform.deepseek.com/api_keys";
  const keyName = provider === "groq" ? "groq-key" : "api-key";
  const keyPrefix = provider === "groq" ? "gsk_..." : "sk-...";

  console.log(chalk.gray(`\nПолучи ключ на: ${keyHint}`));
  const apiKey = (await ask(rl, noColor ? `API ключ (${keyPrefix}): ` : chalk.cyan(`API ключ `) + chalk.gray(`(${keyPrefix}): `))).trim();

  if (apiKey) {
    saveConfigValue(keyName, apiKey);
    console.log(renderSuccess("✓ API ключ сохранён"));
  } else {
    console.log(renderWarn("Ключ не введён. Укажи позже: deepseek config set " + keyName + " <ключ>"));
  }

  // Optional: Tavily
  console.log(chalk.gray("\nTavily API (для веб-поиска, необязательно):"));
  console.log(chalk.gray("Получи на: https://app.tavily.com (бесплатный тир)"));
  const tavilyKey = (await ask(rl, noColor ? "Tavily ключ (Enter = пропустить): " : chalk.cyan("Tavily ключ ") + chalk.gray("(Enter = пропустить): "))).trim();
  if (tavilyKey) {
    saveConfigValue("tavily-key", tavilyKey);
    console.log(renderSuccess("✓ Tavily ключ сохранён"));
  }

  console.log(noColor ? "\nНастройка завершена!\n" : chalk.green.bold("\n✓ Настройка завершена!\n"));
}

// ── Build registry ─────────────────────────────────────────────────────────

function buildRegistry(config: Config, noWebSearch: boolean): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new BashTool(config.bashTimeout));
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new ListDirTool());
  registry.register(new SearchTool());
  if (config.webSearchEnabled && !noWebSearch) {
    registry.register(new WebSearchTool({
      tavilyApiKey: config.tavilyApiKey,
      searchDepth: config.searchDepth,
    }));
  }
  return registry;
}

// ── Slash command handler ──────────────────────────────────────────────────

async function handleSlashCommand(
  input: string,
  ctx: {
    history: ConversationHistory;
    config: Config;
    sessionId: string | null;
    rl: readline.Interface;
    registry: ToolRegistry;
  },
): Promise<{ exit?: boolean; newSessionId?: string; newConfig?: Config }> {
  const [cmd, ...rest] = input.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd?.toLowerCase()) {
    case "help":
      printHelp();
      break;

    case "clear":
      ctx.history.clear();
      console.log(renderInfo("✓ История очищена"));
      break;

    case "exit":
    case "quit":
      return { exit: true };

    case "history": {
      const msgs = ctx.history.getAll().filter((m) => m.role !== "system");
      if (msgs.length === 0) {
        console.log(renderInfo("История пуста"));
        break;
      }
      console.log(noColor ? "\n── История ──" : chalk.bold.cyan("\n── История ──"));
      for (const m of msgs) {
        const label = m.role === "user"
          ? (noColor ? "Ты:" : chalk.bold.green("Ты:"))
          : (noColor ? "AI:" : chalk.bold.cyan("AI:"));
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        const preview = content.slice(0, 120) + (content.length > 120 ? "…" : "");
        console.log(`${label} ${preview}`);
      }
      console.log();
      break;
    }

    case "save": {
      const id = saveSession(
        ctx.history.getAll().filter((m) => m.role !== "system"),
        ctx.config.provider,
        ctx.config.model,
        ctx.sessionId ?? undefined,
      );
      console.log(renderSuccess(`✓ Сессия сохранена: ${id}`));
      return { newSessionId: id };
    }

    case "resume": {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log(renderInfo("Нет сохранённых сессий"));
        break;
      }
      console.log(noColor ? "\n── Сессии ──" : chalk.bold.cyan("\n── Сессии ──"));
      const recent = sessions.slice(0, 10);
      recent.forEach((s, i) => {
        const date = new Date(s.updatedAt).toLocaleString("ru-RU", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        const num = noColor ? `${i + 1}.` : chalk.cyan(`${i + 1}.`);
        const info = noColor ? `[${s.provider}/${s.model}]` : chalk.gray(`[${s.provider}/${s.model}]`);
        const msg = noColor ? s.preview : chalk.white(s.preview);
        console.log(`  ${num} ${date}  ${info}  ${msg}`);
      });
      console.log();

      const choice = (await ask(ctx.rl, noColor ? "Номер сессии (Enter = отмена): " : chalk.cyan("Номер ") + chalk.gray("(Enter = отмена): "))).trim();
      const idx = parseInt(choice, 10) - 1;
      const picked = recent[idx];
      if (!picked) {
        console.log(renderInfo("Отмена"));
        break;
      }
      const session = loadSession(picked.id);
      if (!session) {
        console.log(renderError("Сессия не найдена"));
        break;
      }
      ctx.history.clear();
      ctx.history.addAll(session.messages);
      console.log(renderSuccess(`✓ Загружено ${session.messages.length} сообщений из сессии ${picked.id}`));
      return { newSessionId: picked.id };
    }

    case "model": {
      if (!arg) {
        console.log(renderInfo(`Текущая модель: ${ctx.config.model} (${ctx.config.provider})`));
        console.log(chalk.gray("Использование: /model <название>"));
        if (ctx.config.provider === "groq") {
          console.log(chalk.gray("Модели Groq: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768, gemma2-9b-it"));
        } else {
          console.log(chalk.gray("Модели DeepSeek: deepseek-chat, deepseek-reasoner"));
        }
        break;
      }
      saveConfigValue("model", arg);
      const newConfig = { ...ctx.config, model: arg };
      console.log(renderSuccess(`✓ Модель изменена: ${arg}`));
      return { newConfig };
    }

    case "tools": {
      const tools = ctx.registry.list();
      console.log(noColor ? "\n── Инструменты ──" : chalk.bold.cyan("\n── Инструменты ──"));
      for (const name of tools) {
        console.log(noColor ? `  • ${name}` : `  ${chalk.cyan("•")} ${chalk.white(name)}`);
      }
      console.log();
      break;
    }

    case "config": {
      showConfig(ctx.config);
      break;
    }

    case "setup": {
      await runSetupWizard(ctx.rl);
      // Reload config after wizard
      try {
        const newConfig = loadConfig();
        return { newConfig };
      } catch { break; }
    }

    default:
      console.log(renderWarn(`Неизвестная команда: /${cmd ?? ""}. Введи /help`));
  }

  return {};
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv);
  } catch (err: unknown) {
    if (err instanceof Error && "exitCode" in err) process.exit(1);
    console.error(renderError(String(err)));
    process.exit(1);
  }

  // ── config subcommands (no API key needed) ─────────────────────────────
  if (args.config) {
    if (args.config.action === "set" && args.config.key && args.config.value) {
      try {
        saveConfigValue(args.config.key, args.config.value);
        const isKey = args.config.key.includes("key");
        const display = isKey ? "***" : args.config.value;
        console.log(renderSuccess(`✓ ${args.config.key} = ${display}`));
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

  // ── Load config ────────────────────────────────────────────────────────
  let config: Config;
  let needsSetup = false;

  try {
    config = loadConfig({
      ...(args.provider    ? { provider: args.provider }       : {}),
      ...(args.model       ? { model: args.model }             : {}),
      ...(args.maxTokens   ? { maxTokens: args.maxTokens }     : {}),
      ...(args.debug       ? { debug: true }                   : {}),
      ...(args.noStream    ? { stream: false }                 : {}),
      ...(args.yes         ? { autoApprove: true }             : {}),
      ...(args.dryRun      ? { dryRun: true }                  : {}),
      ...(args.searchDepth ? { searchDepth: args.searchDepth } : {}),
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      // Only hard fail if an explicit prompt was passed (single-shot or pipe mode)
      if (args.prompt) {
        console.error(renderError(err.message));
        process.exit(1);
      }
      // Otherwise always offer the setup wizard (works in TTY, IDE terminals, etc.)
      needsSetup = true;
      config = null as unknown as Config;
    } else {
      throw err;
    }
  }

  if (config!?.debug) logger.setLevel("debug");

  // ── Pipe / single-prompt mode ──────────────────────────────────────────
  // isTTY can be undefined in IDE terminals — treat it as interactive if no explicit prompt
  const hasPipedInput = process.stdin.isTTY === false;
  if ((args.prompt || hasPipedInput) && !needsSetup) {
    let prompt = args.prompt ?? "";
    if (hasPipedInput) {
      const piped = await readStdin();
      if (piped) prompt = prompt ? `${prompt}\n\n${piped}` : piped;
    }
    if (!prompt.trim()) {
      console.error(renderError("No prompt provided"));
      process.exit(1);
    }

    const registry = buildRegistry(config!, args.noWebSearch);
    const client = new DeepSeekClient({
      apiKey: config!.apiKey, model: config!.model,
      maxTokens: config!.maxTokens, temperature: config!.temperature,
      baseUrl: config!.baseUrl,
    });
    const history = new ConversationHistory();
    const agent = new Agent(client, registry, history, {
      maxIterations: config!.maxIterations,
      autoApprove: config!.autoApprove,
      dryRun: config!.dryRun,
      stream: config!.stream,
      debug: config!.debug,
      noWebSearch: args.noWebSearch,
      searchDepth: config!.searchDepth,
    });
    await agent.run(prompt);
    return;
  }

  // ── Interactive REPL mode ──────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  rl.on("close", () => {
    console.log(noColor ? "\nДо свидания!" : chalk.cyan("\nДо свидания!"));
    process.exit(0);
  });

  // Setup wizard if no API key
  if (needsSetup) {
    printBanner(VERSION, "—", "—");
    console.log(renderWarn("API ключ не настроен. Запускаю мастер настройки...\n"));
    await runSetupWizard(rl);
    try {
      config = loadConfig(args.provider ? { provider: args.provider } : {});
    } catch (err) {
      console.error(renderError(err instanceof ConfigError ? err.message : String(err)));
      console.log(chalk.gray("Перезапусти deepseek после настройки ключа."));
      rl.close();
      return;
    }
  }

  printBanner(VERSION, config!.provider, config!.model);

  const registry = buildRegistry(config!, args.noWebSearch);
  const client = new DeepSeekClient({
    apiKey: config!.apiKey, model: config!.model,
    maxTokens: config!.maxTokens, temperature: config!.temperature,
    baseUrl: config!.baseUrl,
  });
  const history = new ConversationHistory();
  let sessionId: string | null = null;
  let currentConfig = config!;

  const agent = new Agent(client, registry, history, {
    maxIterations: currentConfig.maxIterations,
    autoApprove: currentConfig.autoApprove,
    dryRun: currentConfig.dryRun,
    stream: currentConfig.stream,
    debug: currentConfig.debug,
    noWebSearch: args.noWebSearch,
    searchDepth: currentConfig.searchDepth,
    confirm: async (toolName) => {
      const noColorLocal = Boolean(process.env["NO_COLOR"]);
      const prompt = noColorLocal
        ? `\nExecute ${toolName}? [Y/n] `
        : chalk.yellow(`\nExecute ${chalk.bold(toolName)}? [Y/n] `);
      const answer = await ask(rl, prompt);
      const normalized = answer.trim().toLowerCase();
      return normalized === "" || normalized === "y" || normalized === "yes";
    },
  });

  // ── REPL loop ──────────────────────────────────────────────────────────
  while (true) {
    let input: string;
    try {
      input = await ask(rl, renderPrompt());
    } catch {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // Slash commands
    if (trimmed.startsWith("/")) {
      try {
        const result = await handleSlashCommand(trimmed, {
          history, config: currentConfig, sessionId, rl, registry,
        });
        if (result.exit) break;
        if (result.newSessionId) sessionId = result.newSessionId;
        if (result.newConfig) currentConfig = result.newConfig;
      } catch (err) {
        console.error(renderError(err instanceof Error ? err.message : String(err)));
      }
      continue;
    }

    // Plain exit keywords
    if (trimmed === "exit" || trimmed === "quit") break;

    console.log(renderDivider());

    try {
      await agent.run(trimmed);

      // Auto-save session after each turn
      sessionId = saveSession(
        history.getAll().filter((m) => m.role !== "system"),
        currentConfig.provider,
        currentConfig.model,
        sessionId ?? undefined,
      );
    } catch (err) {
      console.error(renderError(err instanceof Error ? err.message : String(err)));
    }

    console.log(renderDivider());
  }

  // Save on exit if there's something to save
  if (history.length > 0 && !sessionId) {
    saveSession(
      history.getAll().filter((m) => m.role !== "system"),
      currentConfig.provider,
      currentConfig.model,
    );
  }

  rl.close();
}

main().catch((err) => {
  // Unhandled error outside REPL loop — show message but don't dump stack
  const msg = err instanceof Error ? err.message : String(err);
  console.error(renderError(`Unexpected error: ${msg}`));
  process.exit(1);
});
