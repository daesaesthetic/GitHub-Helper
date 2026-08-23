import type { RequestIdentity } from "../identity.js";
import type { ContextService } from "../context/context-service.js";
import type { ContextRecord } from "../context/context.js";
import type { GitHubStatus } from "../github/github-service.js";
import { ProjectService } from "../projects/project-service.js";
import type { RealityRecord } from "../reality/reality.js";
import { RealityService } from "../reality/reality-service.js";
import type {
  IntelligenceEvidence,
  IntelligenceHealthState,
  IntelligenceReason,
  MilestoneSummary,
  ProjectIntelligenceResult
} from "./intelligence.js";

export class ProjectIntelligenceService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reality: RealityService,
    private readonly context: ContextService
  ) {}

  async getProjectIntelligence(
    projectId: string,
    identity: RequestIdentity
  ): Promise<ProjectIntelligenceResult> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    const [github, verifiedFacts, contextRecords] = await Promise.all([
      this.projects.getGitHubStatus(project),
      this.reality.getProjectReality(projectId, identity, { verificationState: "verified" }),
      this.context.getProjectContext(projectId, identity)
    ]);
    const state = getProjectState(project.status, verifiedFacts);
    const milestone = getMilestoneSummary();
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description
      },
      state,
      github,
      verifiedFacts,
      supportingEvidence: contextRecords.map(toEvidence),
      milestone,
      health: getHealth(project.status, state.value, github, verifiedFacts, milestone),
      generatedAt: new Date().toISOString()
    };
  }
}

function getProjectState(
  projectStatus: string,
  verifiedFacts: RealityRecord[]
): ProjectIntelligenceResult["state"] {
  const verifiedStatus = verifiedFacts.find((fact) => fact.factType === "project_status");
  const realityStatus = verifiedStatus?.value.status?.trim();
  if (realityStatus) return { value: realityStatus, source: "reality" };
  if (projectStatus.trim()) return { value: projectStatus, source: "project" };
  return { value: "Unknown", source: "unknown" };
}

function getMilestoneSummary(): MilestoneSummary {
  return {
    status: "unavailable",
    reason: "No authoritative milestone data has been established."
  };
}

function getHealth(
  projectStatus: string,
  state: string,
  github: GitHubStatus,
  verifiedFacts: RealityRecord[],
  milestone: MilestoneSummary
): ProjectIntelligenceResult["health"] {
  const reasons: IntelligenceReason[] = [];
  if (state !== "Unknown") {
    reasons.push({
      message: `Project state is ${state}.`,
      source: verifiedFacts.some((fact) => fact.factType === "project_status") ? "reality" : "project"
    });
  } else {
    reasons.push({ message: "Project state is not established.", source: "project" });
  }

  if (github.connected) {
    const repositoryState = github.repository.archived
      ? "Archived"
      : github.repository.disabled
        ? "Disabled"
        : "Active";
    reasons.push({
      message: `GitHub repository is connected and currently reported as ${repositoryState}.`,
      source: "github"
    });
  } else if (github.reason === "not_configured") {
    reasons.push({ message: "GitHub repository is not connected.", source: "github" });
  } else {
    reasons.push({ message: `GitHub repository is currently unavailable (${github.reason}).`, source: "github" });
  }

  if (verifiedFacts.length > 0) {
    reasons.push({
      message: `${verifiedFacts.length} verified Reality fact${verifiedFacts.length === 1 ? "" : "s"} are available.`,
      source: "reality"
    });
  } else {
    reasons.push({ message: "No verified Reality facts are available.", source: "reality" });
  }
  reasons.push({ message: milestone.reason!, source: "milestone" });

  let healthState: IntelligenceHealthState = "unknown";
  if (state === "Unknown") {
    healthState = "unknown";
  } else if (github.connected && !github.repository.archived && !github.repository.disabled) {
    healthState = normalizeActiveStatus(projectStatus, state) ? "active" : "healthy";
  } else if (!github.connected && github.reason !== "not_configured") {
    healthState = "unknown";
  } else if (github.connected && (github.repository.archived || github.repository.disabled)) {
    healthState = "attention";
  } else {
    healthState = "attention";
  }
  return { state: healthState, reasons };
}

function normalizeActiveStatus(projectStatus: string, state: string): boolean {
  return ["development", "active", "in progress", "in_progress"].includes(
    (state || projectStatus).trim().toLowerCase()
  );
}

function toEvidence(record: ContextRecord): IntelligenceEvidence {
  return {
    sourceType: record.sourceType,
    sourceIdentity: record.sourceIdentity,
    reference: record.provenance.sourceUrl
      ?? record.provenance.filePath
      ?? record.provenance.sourceReference
      ?? record.sourceIdentity
  };
}