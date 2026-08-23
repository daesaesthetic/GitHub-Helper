export interface Project {
  id: string;
  name: string;
  ownerId: string;
  description: string;
  status: string;
  metadata: Record<string, string>;
  integrationReferences: string[];
}

export const DEVELOPMENT_PROJECT_ID = "project-dev-platform";

export function createSeedProject(ownerId: string): Project {
  return {
    id: DEVELOPMENT_PROJECT_ID,
    name: "Developer Intelligence Platform",
    ownerId,
    description: "Personal developer intelligence and project operations platform.",
    status: "Development",
    metadata: { source: "temporary-development-seed" },
    integrationReferences: []
  };
}