export const MILESTONE_STATUSES = ["current", "completed", "upcoming"] as const;

export type MilestoneStatus = typeof MILESTONE_STATUSES[number];

export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  status: MilestoneStatus;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProjectMilestoneInput {
  id: string;
  projectId: string;
  title: string;
  status: MilestoneStatus;
  description?: string;
  position?: number;
  completedAt?: string;
}

export class MilestoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilestoneValidationError";
  }
}

export function createProjectMilestone(
  input: ProjectMilestoneInput,
  timestamps: Pick<ProjectMilestone, "createdAt" | "updatedAt"> = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
): ProjectMilestone {
  if (!input.id || !input.projectId || !input.title.trim()) {
    throw new MilestoneValidationError("Milestone identity, project, and title are required");
  }
  if (!MILESTONE_STATUSES.includes(input.status)) {
    throw new MilestoneValidationError("Invalid milestone status");
  }
  if (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0)) {
    throw new MilestoneValidationError("Milestone position must be a non-negative integer");
  }
  return {
    ...input,
    position: input.position ?? 0,
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...timestamps
  };
}