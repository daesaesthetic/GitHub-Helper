export const REALITY_FACT_TYPES = [
  "project_identity",
  "project_status",
  "github_repository"
] as const;

export type RealityFactType = typeof REALITY_FACT_TYPES[number];

export const REALITY_VERIFICATION_STATES = [
  "verified",
  "pending",
  "invalidated"
] as const;

export type RealityVerificationState = typeof REALITY_VERIFICATION_STATES[number];

export interface RealityRecord {
  id: string;
  projectId: string;
  factType: RealityFactType;
  value: Record<string, string>;
  verificationState: RealityVerificationState;
  supportingContextId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RealityRecordInput {
  id: string;
  projectId: string;
  factType: RealityFactType;
  value: Record<string, string>;
  verificationState: RealityVerificationState;
  supportingContextId?: string;
}

export class RealityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealityValidationError";
  }
}

export function createRealityRecord(
  input: RealityRecordInput,
  timestamps: Pick<RealityRecord, "createdAt" | "updatedAt"> = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
): RealityRecord {
  if (!input.id || !input.projectId || Object.keys(input.value).length === 0) {
    throw new RealityValidationError("Reality identity, project, and value are required");
  }
  if (!REALITY_FACT_TYPES.includes(input.factType)) {
    throw new RealityValidationError("Invalid reality fact type");
  }
  if (!REALITY_VERIFICATION_STATES.includes(input.verificationState)) {
    throw new RealityValidationError("Invalid reality verification state");
  }
  return { ...input, ...timestamps };
}