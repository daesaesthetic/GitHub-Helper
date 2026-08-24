import type { ContextRecord } from "../context/context.js";
import type {
  GitHubRepositoryActivityStatus,
  GitHubStatus
} from "../github/github-service.js";
import type { Project } from "../projects/project.js";
import type { RealityRecord } from "../reality/reality.js";

export const INTELLIGENCE_HEALTH_STATES = [
  "healthy",
  "active",
  "attention",
  "blocked",
  "unknown"
] as const;

export type IntelligenceHealthState = typeof INTELLIGENCE_HEALTH_STATES[number];

export interface IntelligenceReason {
  message: string;
  source: "project" | "github" | "reality" | "context" | "milestone";
}

export interface IntelligenceEvidence {
  sourceType: ContextRecord["sourceType"];
  sourceIdentity: string;
  reference: string;
}

export interface MilestoneSummary {
  status: "unavailable" | "established";
  current?: string;
  completed?: string[];
  upcoming?: string[];
  reason?: string;
}

export interface ProjectIntelligenceResult {
  project: Pick<Project, "id" | "name" | "description">;
  state: {
    value: string;
    source: "reality" | "project" | "unknown";
  };
  github: GitHubStatus;
  activity: GitHubRepositoryActivityStatus;
  verifiedFacts: RealityRecord[];
  supportingEvidence: IntelligenceEvidence[];
  milestone: MilestoneSummary;
  health: {
    state: IntelligenceHealthState;
    reasons: IntelligenceReason[];
  };
  generatedAt: string;
}