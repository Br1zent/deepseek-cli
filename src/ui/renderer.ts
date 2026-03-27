import chalk from "chalk";
import type { Usage } from "../agent/types.js";

const noColor = Boolean(process.env["NO_COLOR"]);

// Simple markdown renderer for terminal output
function renderMarkdownSync(text: string): string {
  if (noColor) return text;

  return text
    // Code blocks with language
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang: string | undefined, code: string) => {
      const header = lang ? chalk.gray(`[${lang}]\n`) : "";
      return header + chalk.bgBlack.white(code.trimEnd()) + "\n";
    })
    // Inline code
    .replace(/`([^`]+)`/g, (_m, code: string) => chalk.cyan(code))
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, (_m, t: string) => chalk.bold(t))
    // Italic
    .replace(/\*([^*]+)\*/g, (_m, t: string) => chalk.italic(t))
    // Headers
    .replace(/^#{1,3} (.+)$/gm, (_m, t: string) => chalk.bold.cyan(t))
    // Bullet points
    .replace(/^([*-]) (.+)$/gm, (_m, _b: string, t: string) => `  • ${t}`);
}

export function renderMarkdown(text: string): string {
  try {
    return renderMarkdownSync(text);
  } catch {
    return text;
  }
}

export function renderToolCall(
  toolName: string,
  args: Record<string, unknown>,
  status: "pending" | "success" | "error" | "skipped",
): string {
  const statusSymbol = {
    pending: noColor ? "[?]" : chalk.yellow("◆"),
    success: noColor ? "[✓]" : chalk.green("✓"),
    error: noColor ? "[✗]" : chalk.red("✗"),
    skipped: noColor ? "[-]" : chalk.gray("○"),
  }[status];

  const toolLabel = noColor ? toolName : chalk.bold(toolName);
  const argsStr = formatArgs(args);

  return `${statusSymbol} Tool: ${toolLabel}\n  ${argsStr}`;
}

function formatArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(args)) {
    const valStr =
      typeof val === "string" && val.length > 80 ? val.slice(0, 80) + "..." : String(val);
    parts.push(noColor ? `${key}=${valStr}` : `${chalk.gray(key)}=${chalk.cyan(valStr)}`);
  }
  return parts.join(", ");
}

export function renderUsage(usage: Usage): string {
  if (noColor) {
    return `Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`;
  }
  return chalk.gray(
    `Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`,
  );
}

export function renderError(message: string): string {
  return noColor ? `Error: ${message}` : chalk.red(`Error: ${message}`);
}

export function renderInfo(message: string): string {
  return noColor ? message : chalk.cyan(message);
}

export function renderSuccess(message: string): string {
  return noColor ? message : chalk.green(message);
}

export function renderWarn(message: string): string {
  return noColor ? `Warning: ${message}` : chalk.yellow(`Warning: ${message}`);
}

export function renderPrompt(): string {
  return noColor ? "\nYou: " : chalk.bold.cyan("\nYou: ");
}

export function renderDivider(): string {
  return noColor ? "─".repeat(60) : chalk.gray("─".repeat(60));
}
