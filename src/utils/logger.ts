import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = "info";
  private noColor = Boolean(process.env["NO_COLOR"]);

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[this.level];
  }

  private format(level: LogLevel, msg: string): string {
    if (this.noColor) {
      return `[${level.toUpperCase()}] ${msg}`;
    }
    switch (level) {
      case "debug":
        return chalk.gray(`[DEBUG] ${msg}`);
      case "info":
        return chalk.blue(`[INFO] ${msg}`);
      case "warn":
        return chalk.yellow(`[WARN] ${msg}`);
      case "error":
        return chalk.red(`[ERROR] ${msg}`);
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.error(this.format("debug", msg), ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.error(this.format("info", msg), ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.error(this.format("warn", msg), ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.format("error", msg), ...args);
    }
  }
}

export const logger = new Logger();
