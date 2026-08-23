const secretKeys = /token|secret|password|api[_-]?key|authorization|credential/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secretKeys.test(key) ? "[REDACTED]" : redact(child)
      ])
    );
  }
  return value;
}

export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

export function createLogger(): Logger {
  const write = (level: string, event: string, data?: Record<string, unknown>) => {
    const safeData = redact(data ?? {}) as Record<string, unknown>;
    const record = { timestamp: new Date().toISOString(), level, event, ...safeData };
    console.log(JSON.stringify(record));
  };
  return {
    info: (event, data) => write("info", event, data),
    error: (event, data) => write("error", event, data)
  };
}