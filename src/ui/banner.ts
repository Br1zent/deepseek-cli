import chalk from "chalk";

const noColor = Boolean(process.env["NO_COLOR"]);

const ART = `
  ██████╗ ███████╗███████╗██████╗ ███████╗███████╗███████╗██╗  ██╗
  ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██║ ██╔╝
  ██║  ██║█████╗  █████╗  ██████╔╝███████╗█████╗  █████╗  █████╔╝
  ██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ╚════██║██╔══╝  ██╔══╝  ██╔═██╗
  ██████╔╝███████╗███████╗██║     ███████║███████╗███████╗██║  ██╗
  ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝`;

const SLASH_COMMANDS = [
  ["/help",    "показать это сообщение"],
  ["/clear",   "очистить историю разговора"],
  ["/history", "показать сообщения текущей сессии"],
  ["/save",    "сохранить сессию вручную"],
  ["/resume",  "загрузить предыдущую сессию"],
  ["/model",   "показать или сменить модель  /model [name]"],
  ["/tools",   "список доступных инструментов"],
  ["/config",  "показать текущий конфиг"],
  ["/exit",    "выйти"],
];

export function printBanner(version: string, provider: string, model: string): void {
  if (noColor) {
    console.log(`DeepSeek CLI v${version} [${provider}/${model}]`);
    console.log("author: t.me/Br1zent");
    console.log('Введи /help для списка команд\n');
    return;
  }

  const art = chalk.cyan(ART);

  const width = 68;
  const border  = chalk.cyan("─".repeat(width));
  const vl      = chalk.cyan("│");

  const line = (text: string) => {
    const visible = stripAnsi(text);
    const pad = Math.max(0, width - 2 - visible.length);
    return `${vl} ${text}${" ".repeat(pad)} ${vl}`;
  };

  const versionLine  = line(chalk.gray(`v${version}  `) + chalk.white(`${provider}`) + chalk.gray(" › ") + chalk.cyan(model));
  const authorLine   = line(chalk.gray("author: ") + chalk.bold("t.me/Br1zent"));
  const tipLine      = line(chalk.gray("Введи ") + chalk.cyan("/help") + chalk.gray(" для списка команд, ") + chalk.cyan("/resume") + chalk.gray(" для истории"));

  console.log(art);
  console.log(chalk.cyan("  ╔" + "═".repeat(width) + "╗"));
  console.log(`  ${versionLine}`);
  console.log(`  ${authorLine}`);
  console.log(`  ${chalk.cyan("├" + "─".repeat(width) + "┤")}`);
  console.log(`  ${tipLine}`);
  console.log(chalk.cyan("  ╚" + "═".repeat(width) + "╝"));
  console.log();
}

export function printHelp(): void {
  if (noColor) {
    console.log("\nКоманды:");
    for (const [cmd, desc] of SLASH_COMMANDS) {
      console.log(`  ${cmd.padEnd(12)} ${desc}`);
    }
    console.log();
    return;
  }

  console.log("\n" + chalk.bold.cyan("Команды:"));
  for (const [cmd, desc] of SLASH_COMMANDS) {
    console.log(
      `  ${chalk.cyan((cmd as string).padEnd(12))} ${chalk.gray(desc as string)}`
    );
  }
  console.log();
}

// Minimal ANSI strip for padding calculations
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
