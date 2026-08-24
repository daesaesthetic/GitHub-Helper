import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { ProjectIntelligenceResult } from "../intelligence/intelligence.js";
import type { ProjectIntelligenceService } from "../intelligence/project-intelligence-service.js";
import type { AiService, GroundedEvidencePackage } from "../ai/ai-service.js";
import { redactSensitiveValue } from "../security/secret-redaction.js";

const MAX_EVIDENCE_ITEMS = 40;
const MAX_EVIDENCE_BYTES = 24_000;

export class ProjectEvidenceSelectionError extends Error {}

export class GetProjectExplanation {
  constructor(
    private readonly projects: ProjectService,
    private readonly intelligence: ProjectIntelligenceService,
    private readonly ai: AiService
  ) {}

  async execute(projectId: string, identity: RequestIdentity) {
    const project = this.projects.getAccessibleProject(projectId, identity);
    const intelligence = await this.intelligence.getProjectIntelligence(project.id, identity);
    const evidence = selectEvidence(intelligence);
    return this.ai.explain(evidence);
  }
}

export function selectEvidence(result: ProjectIntelligenceResult): GroundedEvidencePackage {
  const safe = redactSensitiveValue({
    projectId: result.project.id,
    projectName: result.project.name,
    generatedAt: result.generatedAt,
    verifiedFacts: result.verifiedFacts.slice(0, MAX_EVIDENCE_ITEMS),
    sourceInformation: [
      { kind: "project_state", value: result.state },
      { kind: "github", value: result.github },
      { kind: "development", value: result.development },
      { kind: "trends", value: result.trends },
      { kind: "milestone", value: result.milestone },
      { kind: "health", value: result.health },
      ...result.supportingEvidence.slice(0, MAX_EVIDENCE_ITEMS)
    ],
    inferences: [],
    uncertainties: [
      ...(result.github.connected ? [] : [`GitHub data is unavailable: ${result.github.reason}`]),
      ...(result.milestone.status === "established" ? [] : [result.milestone.reason ?? "Milestone data is unavailable."])
    ]
  });
  const bytes = Buffer.byteLength(JSON.stringify(safe), "utf8");
  if (bytes > MAX_EVIDENCE_BYTES) throw new ProjectEvidenceSelectionError("Project evidence exceeds the safe bounded size");
  return safe as GroundedEvidencePackage;
}