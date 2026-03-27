import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { BaseTool, type ToolResult } from "./base.js";
import type { JSONSchema } from "../agent/types.js";

const DEFAULT_TIMEOUT_MS = 30000;

/** Expand leading ~ to home directory */
function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** Resolve the shell binary — prefer $SHELL, fall back to /bin/sh */
const SHELL_BIN = process.env["SHELL"] ?? "/bin/sh";

export class BashTool extends BaseTool {
  readonly name = "bash";
  readonly description =
    "Execute a shell command and return stdout/stderr output. Use for running scripts, installing packages, compiling code, etc.";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
      },
      cwd: {
        type: "string",
        description: "Working directory for the command (default: current directory)",
      },
    },
    required: ["command"],
  };

  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    super();
    this.timeoutMs = timeoutMs;
  }

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const command = String(args["command"] ?? "");
    const timeout = typeof args["timeout"] === "number" ? args["timeout"] : this.timeoutMs;
    const rawCwd = typeof args["cwd"] === "string" ? args["cwd"] : process.cwd();
    const cwd = expandHome(rawCwd);

    if (!command.trim()) {
      return this.failure("Command cannot be empty");
    }

    return new Promise<ToolResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn(SHELL_BIN, ["-c", command], {
        cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);

      child.on("close", (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve(
            this.failure(
              `Command timed out after ${timeout}ms: ${command}`,
            ),
          );
          return;
        }

        const output = [stdout, stderr].filter(Boolean).join("\n").trim();

        if (code !== 0) {
          resolve({
            success: false,
            output: output || `Process exited with code ${code}`,
            error: stderr.trim() || `Exit code: ${code}`,
          });
        } else {
          resolve(this.success(output || "(no output)"));
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve(this.failure(`Failed to spawn process: ${err.message}`));
      });
    });
  }
}
