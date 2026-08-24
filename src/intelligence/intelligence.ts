import type { ContextRecord } from "../context/context.js";
import type {
  GitHubUnavailable,
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

export interface RepositoryDevelopmentSummary {
  status: "available" | "unavailable";
  repository?: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    visibility: "private" | "public";
    url: string;
  };
  activity:
    | {
        status: "available";
        recentCommitCount: number;
        recentIssueCount: number;
        recentPullRequestCount: number;
        openIssueCount: number;
        openPullRequestCount: number;
        latestCommit?: {
          message: string;
          timestamp: string;
          ageSeconds?: number;
        };
        retrievedAt: string;
      }
    | {
        status: "unavailable";
        reason: GitHubUnavailable["reason"];
      };
  reason?: GitHubUnavailable["reason"];
}

export interface RepositoryDevelopmentTrends {
  status: "available" | "unavailable";
  window: {
    start: string;
    end: string;
    durationSeconds: number;
  };
  coverage: "bounded" | "unavailable";
  classification: "active" | "quiet" | "unavailable";
  activityPresent: boolean;
  observed?: {
    commits: number;
    issues: number;
    pullRequests: number;
    openIssues: number;
    openPullRequests: number;
  };
  retrievedAt?: string;
  reason?: GitHubUnavailable["reason"];
}

export interface ProjectIntelligenceResult {
  project: Pick<Project, "id" | "name" | "description">;
  state: {
    value: string;
    source: "reality" | "project" | "unknown";
  };
  github: GitHubStatus;
  activity: GitHubRepositoryActivityStatus;
  development: RepositoryDevelopmentSummary;
  trends: RepositoryDevelopmentTrends;
  verifiedFacts: RealityRecord[];
  supportingEvidence: IntelligenceEvidence[];
  milestone: MilestoneSummary;
  health: {
    state: IntelligenceHealthState;
    reasons: IntelligenceReason[];
  };
  generatedAt: string;
}