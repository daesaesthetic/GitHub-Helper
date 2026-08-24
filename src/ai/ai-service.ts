import { redactSensitiveText, redactSensitiveValue } from "../security/secret-redaction.js";

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

export class UnavailableAiService implements AiService {
  async explain(_input: GroundedEvidencePackage): Promise<GroundedExplanation> {
    throw new AiProviderUnavailableError();
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
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.provider(prompt, controller.signal);
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
        clearTimeout(timeout);
      }
    }
    throw new Error(lastError instanceof Error && lastError.name === "AbortError"
      ? "AI provider timed out"
      : "AI provider is unavailable");
  }
}