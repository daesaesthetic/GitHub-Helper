export const CONTEXT_SCOPES = [
  "user",
  "project",
  "repository",
  "discord_guild",
  "discord_channel",
  "conversation"
] as const;

export type ContextScope = typeof CONTEXT_SCOPES[number];

export const CONTEXT_SOURCE_TYPES = [
  "github_repository",
  "github_file",
  "github_documentation",
  "discord_message",
  "discord_conversation",
  "user_authored"
] as const;

export type ContextSourceType = typeof CONTEXT_SOURCE_TYPES[number];

export interface ContextProvenance {
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryId?: string;
  filePath?: string;
  sourceUrl?: string;
  sourceReference?: string;
}

export interface ContextRecord {
  id: string;
  projectId: string;
  scope: ContextScope;
  sourceType: ContextSourceType;
  sourceIdentity: string;
  content: string;
  metadata: Record<string, string>;
  provenance: ContextProvenance;
  createdAt: string;
  updatedAt: string;
  sourceTimestamp?: string;
}

export interface ContextRecordInput {
  id: string;
  projectId: string;
  scope: ContextScope;
  sourceType: ContextSourceType;
  sourceIdentity: string;
  content: string;
  metadata?: Record<string, string>;
  provenance: ContextProvenance;
  sourceTimestamp?: string;
}

export function createContextRecord(
  input: ContextRecordInput,
  timestamps: Pick<ContextRecord, "createdAt" | "updatedAt"> = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
): ContextRecord {
  if (!input.id || !input.projectId || !input.sourceIdentity || !input.content) {
    throw new ContextValidationError("Context identity, project, source, and content are required");
  }
  if (!CONTEXT_SCOPES.includes(input.scope)) {
    throw new ContextValidationError("Invalid context scope");
  }
  if (!CONTEXT_SOURCE_TYPES.includes(input.sourceType)) {
    throw new ContextValidationError("Invalid context source type");
  }
  return {
    ...input,
    metadata: input.metadata ?? {},
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt
  };
}

export class ContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextValidationError";
  }
}

export function isSecretBearingPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    /(^|\/)\.env(?:\.|$)/.test(normalized) ||
    /(^|\/)(?:id_rsa|id_ed25519|credentials(?:\.json)?|secrets?)(?:$|[./])/.test(normalized) ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".key")
  );
}