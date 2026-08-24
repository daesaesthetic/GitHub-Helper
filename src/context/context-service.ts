import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { ContextRecord, ContextRecordInput } from "./context.js";
import { createContextRecord } from "./context.js";
import type { ContextQuery, ContextStore } from "./context-store.js";

export class ContextService {
  constructor(
    private readonly store: ContextStore,
    private readonly projects: ProjectService
  ) {}

  async storeProjectContext(input: ContextRecordInput): Promise<ContextRecord> {
    return this.store.upsert(createContextRecord(input));
  }

  async getProjectContext(
    projectId: string,
    identity: RequestIdentity,
    query: Omit<ContextQuery, "projectId"> = {}
  ): Promise<ContextRecord[]> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    return this.store.list({ projectId: project.id, ...query });
  }

  async getContextById(id: string, identity: RequestIdentity): Promise<ContextRecord | undefined> {
    const record = await this.store.findById(id);
    if (!record) return undefined;
    this.projects.getAccessibleProject(record.projectId, identity);
    return record;
  }

  async removeContext(id: string, identity: RequestIdentity): Promise<boolean> {
    const record = await this.getContextById(id, identity);
    return record ? this.store.delete(id) : false;
  }
}