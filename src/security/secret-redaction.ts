const REDACTED = "[REDACTED]";

const sensitiveKey = /(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|authorization|credential|connection[_-]?string)/i;
const assignment = /(\b(?:api[_-]?key|token|secret|password|passwd|private[_-]?key|authorization|client[_-]?secret|github_token|discord_token|replit[_-]?(?:token|password|credential))\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"',;{}\[\]]+)/gi;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const pem = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi;
const githubToken = /\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/gi;
const connectionString = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s:@]+(?::[^@\s]+)?@[^/\s]+(?:\/[^\s"'`]+)?/gi;
const discordToken = /\b[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g;

export function redactSensitiveText(input: string): string {
  return input
    .replace(pem, REDACTED)
    .replace(connectionString, REDACTED)
    .replace(bearer, `Bearer ${REDACTED}`)
    .replace(githubToken, REDACTED)
    .replace(discordToken, REDACTED)
    .replace(assignment, `$1${REDACTED}`)
    .replace(/(["'])(?:sk|xai|r8|hf)_[A-Za-z0-9_-]{12,}\1/gi, `$1${REDACTED}$1`);
}

export function redactSensitiveValue<T>(value: T, depth = 0): T {
  if (depth > 8) return REDACTED as T;
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, depth + 1)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitiveKey.test(key) ? REDACTED : redactSensitiveValue(item, depth + 1);
  }
  return output as T;
}

export function containsUnredactedSecretPattern(input: unknown): boolean {
  if (typeof input === "string") {
    return new RegExp(pem.source, "i").test(input) ||
      new RegExp(bearer.source, "i").test(input) ||
      new RegExp(githubToken.source, "i").test(input) ||
      new RegExp(discordToken.source).test(input) ||
      new RegExp(connectionString.source, "i").test(input) ||
      new RegExp(assignment.source, "i").test(input);
  }
  if (Array.isArray(input)) return input.some(containsUnredactedSecretPattern);
  if (input && typeof input === "object") return Object.values(input).some(containsUnredactedSecretPattern);
  return false;
}

export { REDACTED };