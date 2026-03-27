import { APIError } from "./errors.js";
import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): { retry: boolean; waitMs?: number } {
  if (error instanceof APIError) {
    if (error.statusCode === 429) {
      return { retry: true, waitMs: (error.retryAfter ?? 60) * 1000 };
    }
    if (error.statusCode !== undefined && error.statusCode >= 500) {
      return { retry: true };
    }
  }
  return { retry: false };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const { retry, waitMs } = isRetryable(err);

      if (!retry || attempt === opts.maxAttempts) {
        throw err;
      }

      const backoff = waitMs ?? Math.min(
        opts.initialDelayMs * Math.pow(opts.factor, attempt - 1),
        opts.maxDelayMs,
      );

      if (err instanceof APIError && err.statusCode === 429) {
        const seconds = Math.ceil(backoff / 1000);
        process.stderr.write(`\rRate limited. Retrying in ${seconds}s...`);
        for (let i = seconds; i > 0; i--) {
          process.stderr.write(`\rRate limited. Retrying in ${i}s...  `);
          await delay(1000);
        }
        process.stderr.write("\r" + " ".repeat(40) + "\r");
      } else {
        logger.warn(`Attempt ${attempt} failed. Retrying in ${backoff}ms...`);
        await delay(backoff);
      }
    }
  }

  throw lastError;
}
