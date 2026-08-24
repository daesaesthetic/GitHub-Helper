import {
  containsUnredactedSecretPattern,
  redactSensitiveText,
  redactSensitiveValue
} from "../security/secret-redaction.js";

export interface GroundedEvidencePackage {
  projectId: string;
  projectName: string;
  generatedAt: string;
  verifiedFacts: unknown[];
  sourceInformation: unknown[];
  inferences: string[];
  uncertainties: string[];
}

export interface GroundedExplanation {
  text: string;
  evidenceCount: number;
  generatedAt: string;
}

export interface AiService {
  explain(input: GroundedEvidencePackage): Promise<GroundedExplanation>;
}

export class AiProviderUnavailableError extends Error {
  constructor(message = "No AI provider is configured") {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

export class AiProviderTimeoutError extends Error {
  constructor() {
    super("AI provider timed out");
    this.name = "AiProviderTimeoutError";
  }
}

export class UnavailableAiService implements AiService {
  async explain(_input: GroundedEvidencePackage): Promise<GroundedExplanation> {
    throw new AiProviderUnavailableError();
  }
}

export class MockAiService implements AiService {
  async explain(input: GroundedEvidencePackage): Promise<GroundedExplanation> {
    const safeInput = redactSensitiveValue(input);
    if (containsUnredactedSecretPattern(safeInput)) {
      throw new Error("Mock AI input failed sensitive-data validation");
    }

    const lines = [
      "Mock grounded project explanation (local test provider)",
      `Project: ${safeInput.projectName} (${safeInput.projectId})`,
      "",
      "Verified facts:",
      ...(safeInput.verifiedFacts.length > 0
        ? safeInput.verifiedFacts.map((fact) => `- ${formatEvidenceValue(fact)}`)
        : ["- None available."]),
      "",
      "Source-derived information:",
      ...(safeInput.sourceInformation.length > 0
        ? safeInput.sourceInformation.map((source) => `- ${formatEvidenceValue(source)}`)
        : ["- None available."]),
      "",
      "Uncertainty and unavailable information:",
      ...(safeInput.uncertainties.length > 0
        ? safeInput.uncertainties.map((item) => `- ${item}`)
        : ["- No additional uncertainty was supplied."]),
      "",
      "This explanation contains no facts beyond the supplied evidence."
    ];
    const text = redactSensitiveText(lines.join("\n")).slice(0, 1_800);
    return {
      text,
      evidenceCount: input.verifiedFacts.length + input.sourceInformation.length,
      generatedAt: input.generatedAt
    };
  }
}

export class BoundedAiService implements AiService {
  constructor(
    private readonly provider: (prompt: string, signal: AbortSignal) => Promise<string>,
    private readonly timeoutMs = 10_000,
    private readonly retries = 1
  ) {}

  async explain(input: GroundedEvidencePackage): Promise<GroundedExplanation> {
    const safeInput = redactSensitiveValue(input);
    const prompt = redactSensitiveText(JSON.stringify(safeInput));
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          this.provider(prompt, controller.signal),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              controller.abort();
              reject(new AiProviderTimeoutError());
            }, this.timeoutMs);
          })
        ]);
        const text = redactSensitiveText(response).trim();
        if (!text) throw new Error("AI provider returned an empty response");
        return {
          text,
          evidenceCount: input.verifiedFacts.length + input.sourceInformation.length,
          generatedAt: new Date().toISOString()
        };
      } catch (error) {
        lastError = error;
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }
    if (lastError instanceof AiProviderTimeoutError) throw lastError;
    throw new Error("AI provider is unavailable");
  }
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  if (record.kind && "value" in record) {
    return `${String(record.kind)}: ${formatEvidenceValue(record.value)}`;
  }
  if (record.sourceType && record.reference) {
    return `${String(record.sourceType)} (${String(record.sourceIdentity ?? "unknown")}): ${String(record.reference)}`;
  }
  return JSON.stringify(record);
}