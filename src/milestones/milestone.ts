export const MILESTONE_STATUSES = ["current", "completed", "upcoming"] as const;

export type MilestoneStatus = typeof MILESTONE_STATUSES[number];

export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  status: MilestoneStatus;
}