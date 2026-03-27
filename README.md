# DeepSeek CLI

A production-ready terminal AI coding assistant powered by the [DeepSeek API](https://platform.deepseek.com). Similar to Claude Code — it can read/write files, run shell commands, search your codebase, and browse the web.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     CLI Entry Point                  │
│                  src/cli/index.ts                    │
│              (args, config, REPL loop)               │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │      Agent Loop      │
          │  src/agent/agent.ts  │
          │ plan→tool→observe→  │
          │       repeat         │
          └──┬──────────────┬───┘
             │              │
   ┌─────────▼──┐    ┌──────▼──────────┐
   │ DeepSeek   │    │  Tool Registry   │
   │ API Client │    │ src/tools/       │
   │ (SSE/REST) │    │ registry.ts      │
   └─────────┬──┘    └──────┬──────────┘
             │              │
   ┌─────────▼──┐    ┌──────▼──────────────────────┐
   │  Streaming  │    │  Tools                       │
   │  Parser     │    │  bash / read_file /          │
   │  (SSE)      │    │  write_file / list_dir /     │
   └─────────────┘    │  search / web_search         │
                       └─────────────────────────────┘
             │
   ┌─────────▼──────────────────┐
   │  Context / Config / Utils   │
   │  conversation.ts            │
   │  config/loader.ts           │
   │  utils/retry.ts             │
   └────────────────────────────┘
```

## Installation

### Одной командой (рекомендуется)

```bash
curl -fsSL https://raw.githubusercontent.com/Br1zent/deepseek-cli/main/install.sh | bash
```

Скрипт клонирует репо, соберёт проект и добавит `deepseek` в PATH автоматически.

### Вручную

```bash
git clone https://github.com/Br1zent/deepseek-cli.git
cd deepseek-cli
pnpm install
pnpm build
npm link   # делает `deepseek` доступным глобально
```

### Удаление

```bash
curl -fsSL https://raw.githubusercontent.com/Br1zent/deepseek-cli/main/uninstall.sh | bash
```

## Quick Start

```bash
# Set your DeepSeek API key
deepseek config set api-key sk-your-key-here

# (Optional) Set Tavily key for web search
deepseek config set tavily-key tvly-your-key-here

# Start interactive REPL
deepseek

# Single prompt
deepseek "Explain this codebase"

# Pipe input
cat error.log | deepseek "What caused this error?"
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `[prompt]` | Single prompt mode (omit for REPL) |
| `-m, --model <model>` | Model to use (`deepseek-chat`, `deepseek-reasoner`) |
| `-y, --yes` | Auto-approve all tool executions |
| `--no-stream` | Disable streaming output |
| `--max-tokens <n>` | Maximum tokens per response |
| `--debug` | Enable verbose debug logging |
| `--no-web-search` | Disable web search tool |
| `--search-depth <depth>` | Tavily search depth: `basic` or `advanced` |
| `--dry-run` | Plan tools but don't execute them |

## Config Commands

```bash
deepseek config set api-key <key>       # Save DeepSeek API key
deepseek config set tavily-key <key>    # Save Tavily API key
deepseek config set model deepseek-reasoner
deepseek config set max-tokens 4096
deepseek config set bash-timeout 60000  # ms
deepseek config show                    # Print current config
```

## Configuration Reference

Config is loaded in priority order (highest wins):

1. CLI flags
2. Environment variables
3. `~/.deepseek-cli/config.json`
4. Built-in defaults

| Key | Env Variable | Default | Description |
|-----|-------------|---------|-------------|
| `apiKey` | `DEEPSEEK_API_KEY` | required | DeepSeek API key |
| `model` | `DEEPSEEK_MODEL` | `deepseek-chat` | Model ID |
| `maxTokens` | `DEEPSEEK_MAX_TOKENS` | `8192` | Max tokens per response |
| `temperature` | `DEEPSEEK_TEMPERATURE` | `0` | Sampling temperature |
| `baseUrl` | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | API base URL |
| `tavilyApiKey` | `TAVILY_API_KEY` | optional | Tavily search API key |
| `webSearchEnabled` | — | `true` | Enable web search tool |
| `searchDepth` | — | `basic` | Tavily search depth |
| `maxIterations` | — | `50` | Max agent loop iterations |
| `bashTimeout` | — | `30000` | Shell command timeout (ms) |
| `debug` | `DEBUG` | `false` | Verbose logging |
| `stream` | — | `true` | Stream responses |
| `autoApprove` | — | `false` | Auto-approve tool calls |
| `dryRun` | — | `false` | Plan only, don't execute |

## Adding a New Tool

1. Create `src/tools/my_tool.ts`:

```typescript
import { BaseTool, type ToolResult } from "./base.js";
import type { JSONSchema } from "../agent/types.js";

export class MyTool extends BaseTool {
  readonly name = "my_tool";
  readonly description = "Does something useful";
  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      input: { type: "string", description: "Input value" },
    },
    required: ["input"],
  };

  async run(args: Record<string, unknown>): Promise<ToolResult> {
    const input = String(args["input"] ?? "");
    // ... your logic ...
    return this.success(`Result: ${input}`);
  }
}
```

2. Register in `src/cli/index.ts`:

```typescript
import { MyTool } from "../tools/my_tool.js";
// ...
registry.register(new MyTool());
```

That's it. The tool is automatically available to the agent — no other changes needed.

## Available Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands (30s timeout by default) |
| `read_file` | Read file contents with optional line range |
| `write_file` | Write or patch files |
| `list_dir` | Recursive directory tree (respects .gitignore) |
| `search` | Ripgrep/grep wrapper for codebase search |
| `web_search` | Internet search via Tavily API |

## Development

```bash
pnpm install      # Install dependencies
pnpm build        # Build ESM bundle
pnpm test         # Run all tests
pnpm test:watch   # Watch mode
pnpm lint         # TypeScript type check
```

## Security

- Tool executions require confirmation by default (use `--yes` to skip)
- File paths are sanitized against path traversal attacks
- API keys are masked in logs and `config show` output
- Bash commands run with 30-second timeout by default
- `--dry-run` mode plans without executing any tools

## License

MIT
