import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Config Loader", () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-config-test-"));
    // Redirect config dir to isolated tmpDir so tests don't read real ~/.deepseek-cli
    process.env["DEEPSEEK_CONFIG_DIR"] = tmpDir;
    delete process.env["DEEPSEEK_API_KEY"];
    delete process.env["DEEPSEEK_MODEL"];
    delete process.env["GROQ_API_KEY"];
    delete process.env["GROQ_MODEL"];
    delete process.env["TAVILY_API_KEY"];
    delete process.env["DEBUG"];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.assign(process.env, originalEnv);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    delete process.env["DEEPSEEK_CONFIG_DIR"];
  });

  it("throws ConfigError when apiKey is missing", async () => {
    const { loadConfig } = await import("../../src/config/loader.js");
    expect(() => loadConfig({})).toThrow(/api.*key|required/i);
  });

  it("loads apiKey from DEEPSEEK_API_KEY env variable", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-from-env";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({});
    expect(config.apiKey).toBe("sk-from-env");
    expect(config.provider).toBe("deepseek");
  });

  it("CLI overrides take highest priority", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-from-env";
    process.env["DEEPSEEK_MODEL"] = "deepseek-chat";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ model: "deepseek-reasoner" });
    expect(config.model).toBe("deepseek-reasoner");
  });

  it("uses default values for optional fields", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-test";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({});
    expect(config.model).toBe("deepseek-chat");
    expect(config.maxTokens).toBe(8192);
    expect(config.temperature).toBe(0);
    expect(config.stream).toBe(true);
  });

  it("loads tavilyApiKey from env", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-test";
    process.env["TAVILY_API_KEY"] = "tvly-from-env";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({});
    expect(config.tavilyApiKey).toBe("tvly-from-env");
  });

  it("enables debug when DEBUG env var is true", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-test";
    process.env["DEBUG"] = "true";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({});
    expect(config.debug).toBe(true);
  });

  // ── Groq provider tests ────────────────────────────────────────────────────

  it("resolves Groq API key from GROQ_API_KEY env", async () => {
    process.env["GROQ_API_KEY"] = "gsk-groq-key";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "groq" });
    expect(config.apiKey).toBe("gsk-groq-key");
    expect(config.provider).toBe("groq");
  });

  it("uses Groq base URL when provider is groq", async () => {
    process.env["GROQ_API_KEY"] = "gsk-groq-key";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "groq" });
    expect(config.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("uses Groq default model when provider is groq", async () => {
    process.env["GROQ_API_KEY"] = "gsk-groq-key";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "groq" });
    expect(config.model).toBe("llama-3.3-70b-versatile");
  });

  it("allows overriding model for Groq provider", async () => {
    process.env["GROQ_API_KEY"] = "gsk-groq-key";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "groq", model: "mixtral-8x7b-32768" });
    expect(config.model).toBe("mixtral-8x7b-32768");
  });

  it("throws friendly error when provider is groq but no GROQ_API_KEY", async () => {
    const { loadConfig } = await import("../../src/config/loader.js");
    expect(() => loadConfig({ provider: "groq" })).toThrow(/groq-key|GROQ_API_KEY/i);
  });

  it("DeepSeek key takes precedence over Groq key when provider is deepseek", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-deepseek";
    process.env["GROQ_API_KEY"] = "gsk-groq";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "deepseek" });
    expect(config.apiKey).toBe("sk-deepseek");
    expect(config.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("stores groqApiKey separately from resolved apiKey", async () => {
    process.env["GROQ_API_KEY"] = "gsk-groq-key";
    const { loadConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "groq" });
    expect(config.groqApiKey).toBe("gsk-groq-key");
    expect(config.apiKey).toBe("gsk-groq-key");
  });

  it("masks keys in showConfig output", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-test-long-key-1234";
    process.env["GROQ_API_KEY"] = "gsk-test-long-key-5678";
    const { loadConfig, showConfig } = await import("../../src/config/loader.js");
    const config = loadConfig({ provider: "deepseek" });
    config.groqApiKey = "gsk-test-long-key-5678";

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (s: string) => lines.push(s);
    showConfig(config);
    console.log = origLog;

    const output = lines.join("\n");
    expect(output).not.toContain("sk-test-long-key-1234");
    expect(output).not.toContain("gsk-test-long-key-5678");
    expect(output).toContain("...");
  });
});
