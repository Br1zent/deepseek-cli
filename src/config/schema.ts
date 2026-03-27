import { z } from "zod";

export const PROVIDERS = ["deepseek", "groq"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_DEFAULTS: Record<Provider, { baseUrl: string; model: string }> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
};

export const ConfigSchema = z
  .object({
    provider: z.enum(PROVIDERS).default("deepseek"),
    // Resolved API key (set by loader from apiKey or groqApiKey based on provider)
    apiKey: z.string().min(1),
    groqApiKey: z.string().optional(),
    model: z.string().default("deepseek-chat"),
    maxTokens: z.number().int().positive().max(65536).default(8192),
    temperature: z.number().min(0).max(2).default(0),
    baseUrl: z.string().url().default("https://api.deepseek.com/v1"),
    tavilyApiKey: z.string().optional(),
    webSearchEnabled: z.boolean().default(true),
    searchDepth: z.enum(["basic", "advanced"]).default("basic"),
    maxIterations: z.number().int().positive().default(50),
    bashTimeout: z.number().int().positive().default(30000),
    debug: z.boolean().default(false),
    stream: z.boolean().default(true),
    autoApprove: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  });

export type Config = z.infer<typeof ConfigSchema>;

export const PartialConfigSchema = ConfigSchema.partial().omit({ apiKey: true });
export type PartialConfig = z.infer<typeof PartialConfigSchema>;
