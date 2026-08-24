import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { ContextService } from "../context/context-service.js";
import {
  createRealityRecord,
  type RealityRecord,
  type RealityRecordInput
} from "./reality.js";
import type { RealityQuery, RealityStore } from "./reality-store.js";

export class RealityService {
  constructor(
    private readonly store: RealityStore,
    private readonly projects: ProjectService,
    private readonly context?: ContextService
  ) {}

  async establishFact(
    input: RealityRecordInput,
    identity: RequestIdentity
  ): Promise<RealityRecord> {
    this.projects.getAccessibleProject(input.projectId, identity);
    await this.assertSupportingContext(input, identity);
    return this.store.upsert(createRealityRecord(input));
  }

  async getProjectReality(
    projectId: string,
    identity: RequestIdentity,
    query: Omit<RealityQuery, "projectId"> = {}
  ): Promise<RealityRecord[]> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    return this.store.list({ projectId: project.id, ...query });
  }

  async getFactById(id: string, identity: RequestIdentity): Promise<RealityRecord | undefined> {
    const record = await this.store.findById(id);
    if (!record) return undefined;
    this.projects.getAccessibleProject(record.projectId, identity);
    return record;
  }

  async updateFact(
    input: RealityRecordInput,
    identity: RequestIdentity
  ): Promise<RealityRecord> {
    const existing = await this.getFactById(input.id, identity);
    if (!existing) throw new Error("Reality fact was not found");
    await this.assertSupportingContext(input, identity);
    return this.store.upsert(createRealityRecord(input, {
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    }));
  }

  async invalidateFact(id: string, identity: RequestIdentity): Promise<RealityRecord | undefined> {
    const existing = await this.getFactById(id, identity);
    if (!existing) return undefined;
    return this.store.upsert(createRealityRecord({
      ...existing,
      verificationState: "invalidated"
    }, {
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    }));
  }

  private async assertSupportingContext(
    input: RealityRecordInput,
    identity: RequestIdentity
  ): Promise<void> {
    if (!input.supportingContextId) return;
    if (!this.context) throw new Error("Supporting context is unavailable");
    const context = await this.context.getContextById(input.supportingContextId, identity);
    if (!context || context.projectId !== input.projectId) {
      throw new Error("Supporting context was not found");
    }
  }
}