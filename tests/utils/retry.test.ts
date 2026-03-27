import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/utils/retry.js";
import { APIError } from "../../src/utils/errors.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new APIError("Server Error", 500))
      .mockRejectedValueOnce(new APIError("Server Error", 502))
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx (non-429) errors", async () => {
    const fn = vi.fn().mockRejectedValue(new APIError("Not Found", 404));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow(APIError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and throws last error", async () => {
    const fn = vi.fn().mockRejectedValue(new APIError("Server Error", 500));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20 }),
    ).rejects.toThrow(APIError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-API errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Some other error"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow("Some other error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
