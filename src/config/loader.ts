import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigError } from "../utils/errors.js";
import {
  ConfigSchema,
  PartialConfigSchema,
  PROVIDER_DEFAULTS,
  type Config,
  type PartialConfig,
  type Provider,
} from "./schema.js";

const CONFIG_DIR = path.join(os.homedir(), ".deepseek-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function loadFileConfig(): PartialConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const result = PartialConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new ConfigError(
        `Invalid config file at ${CONFIG_FILE}:\n${result.error.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    return result.data;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Failed to read config file: ${String(err)}`);
  }
}

function loadEnvConfig(): Partial<Config> {
  const env: Partial<Config> = {};

  const apiKey = process.env["DEEPSEEK_API_KEY"];
  if (apiKey) env.apiKey = apiKey;

  const groqApiKey = process.env["GROQ_API_KEY"];
  if (groqApiKey) env.groqApiKey = groqApiKey;

  const model = process.env["DEEPSEEK_MODEL"] ?? process.env["GROQ_MODEL"];
  if (model) env.model = model;

  const maxTokens = process.env["DEEPSEEK_MAX_TOKENS"];
  if (maxTokens) env.maxTokens = parseInt(maxTokens, 10);

  const temperature = process.env["DEEPSEEK_TEMPERATURE"];
  if (temperature) env.temperature = parseFloat(temperature);

  const baseUrl = process.env["DEEPSEEK_BASE_URL"];
  if (baseUrl) env.baseUrl = baseUrl;

  const tavilyApiKey = process.env["TAVILY_API_KEY"];
  if (tavilyApiKey) env.tavilyApiKey = tavilyApiKey;

  const debug = process.env["DEBUG"];
  if (debug === "true" || debug === "1") env.debug = true;

  return env;
}

/**
 * Resolve provider-specific defaults before schema validation.
 * Sets apiKey and baseUrl from the active provider if not already set.
 */
function resolveProviderDefaults(merged: Partial<Config>): Partial<Config> {
  const provider: Provider = (merged.provider as Provider | undefined) ?? "deepseek";
  const defaults = PROVIDER_DEFAULTS[provider];

  const result = { ...merged };

  // Apply provider base URL default if not explicitly overridden
  if (!result.baseUrl) {
    result.baseUrl = defaults.baseUrl;
  }

  // Apply provider model default if not set
  if (!result.model) {
    result.model = defaults.model;
  }

  // Resolve API key from provider-specific source
  if (!result.apiKey) {
    if (provider === "groq" && result.groqApiKey) {
      result.apiKey = result.groqApiKey;
    }
  }

  return result;
}

function buildMissingKeyError(provider: Provider): string {
  if (provider === "groq") {
    return (
      `Configuration error:\n  apiKey: GROQ_API_KEY is required\n\n` +
      `Run: deepseek config set groq-key <your-key>\n` +
      `Or:  export GROQ_API_KEY=gsk_...`
    );
  }
  return (
    `Configuration error:\n  apiKey: DEEPSEEK_API_KEY is required\n\n` +
    `Run: deepseek config set api-key <your-key>\n` +
    `Or:  export DEEPSEEK_API_KEY=sk-...`
  );
}

export function loadConfig(cliOverrides: Partial<Config> = {}): Config {
  const fileConfig = loadFileConfig();
  const envConfig = loadEnvConfig();

  const merged = resolveProviderDefaults({
    ...fileConfig,
    ...envConfig,
    ...cliOverrides,
  });

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const provider: Provider = (merged.provider as Provider | undefined) ?? "deepseek";
    // Check if the only error is a missing apiKey — give a targeted message
    const issues = result.error.issues;
    const onlyApiKeyMissing =
      issues.length === 1 &&
      issues[0]?.path[0] === "apiKey";

    if (onlyApiKeyMissing) {
      throw new ConfigError(buildMissingKeyError(provider));
    }

    const details = issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new ConfigError(`Configuration error:\n${details}`);
  }

  return result.data;
}

export function saveConfigValue(key: string, value: string): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  let current: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      current = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // start fresh if corrupted
    }
  }

  const keyMap: Record<string, string> = {
    "api-key": "apiKey",
    "groq-key": "groqApiKey",
    "tavily-key": "tavilyApiKey",
    provider: "provider",
    model: "model",
    "max-tokens": "maxTokens",
    temperature: "temperature",
    "base-url": "baseUrl",
    "bash-timeout": "bashTimeout",
    "max-iterations": "maxIterations",
  };

  const mappedKey = keyMap[key] ?? key;

  if (
    mappedKey === "apiKey" ||
    mappedKey === "groqApiKey" ||
    mappedKey === "tavilyApiKey"
  ) {
    current[mappedKey] = value;
  } else if (
    mappedKey === "maxTokens" ||
    mappedKey === "bashTimeout" ||
    mappedKey === "maxIterations"
  ) {
    current[mappedKey] = parseInt(value, 10);
  } else if (mappedKey === "temperature") {
    current[mappedKey] = parseFloat(value);
  } else {
    current[mappedKey] = value;
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), { mode: 0o600 });
}

function maskKey(key: string): string {
  if (key.length <= 12) return "*".repeat(key.length);
  return key.slice(0, 8) + "..." + key.slice(-4);
}

export function showConfig(config: Config): void {
  const safe = { ...config } as Record<string, unknown>;
  if (typeof safe["apiKey"] === "string") safe["apiKey"] = maskKey(safe["apiKey"] as string);
  if (typeof safe["groqApiKey"] === "string") safe["groqApiKey"] = maskKey(safe["groqApiKey"] as string);
  if (typeof safe["tavilyApiKey"] === "string") safe["tavilyApiKey"] = maskKey(safe["tavilyApiKey"] as string);
  console.log(JSON.stringify(safe, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
