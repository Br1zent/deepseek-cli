export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class ToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class PathTraversalError extends Error {
  constructor(path: string) {
    super(`Path traversal attempt detected: ${path}`);
    this.name = "PathTraversalError";
  }
}
