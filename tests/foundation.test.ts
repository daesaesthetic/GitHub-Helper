import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, ConfigurationError } from "../src/config.js";
import { extractIdentity } from "../src/identity.js";
import { createSeedProject, DEVELOPMENT_PROJECT_ID } from "../src/projects/project.js";
import {
  InMemoryProjectRepository,
  ProjectAccessDeniedError,
  ProjectService
} from "../src/projects/project-service.js";
import { GetProjectStatus } from "../src/use-cases/project-status.js";
import { handleProjectCommand } from "../src/discord/project-status-command.js";
import { createLogger } from "../src/logging.js";
import { startHealthServer } from "../src/health.js";
import { GitHubClient } from "../src/github/github-client.js";
import { GitHubService } from "../src/github/github-service.js";
import {
  ContextValidationError,
  createContextRecord,
  isSecretBearingPath
} from "../src/context/context.js";
import { InMemoryContextStore } from "../src/context/context-store.js";
import { ContextService } from "../src/context/context-service.js";
import { GitHubContextIngestionService } from "../src/context/github-context-ingestion-service.js";
import { GetProjectContext } from "../src/use-cases/project-context.js";
import { handleContextCommand } from "../src/discord/context-command.js";
import {
  RealityValidationError,
  createRealityRecord
} from "../src/reality/reality.js";
import { InMemoryRealityStore } from "../src/reality/reality-store.js";
import { RealityService } from "../src/reality/reality-service.js";
import { ProjectRealityBootstrap } from "../src/reality/reality-bootstrap.js";
import { GetProjectReality } from "../src/use-cases/project-reality.js";
import { handleRealityCommand } from "../src/discord/reality-command.js";

const ownerId = "owner-123";
const projectService = new ProjectService(
  new InMemoryProjectRepository(createSeedProject(ownerId))
);

test("extracts Discord user, guild, and channel identity", () => {
  const identity = extractIdentity({
    user: { id: "discord-123", username: "dev", globalName: "Developer" } as never,
    guildId: "guild-1",
    channelId: "channel-1"
  });
  assert.deepEqual(identity, {
    userId: "discord-123",
    username: "dev",
    displayName: "Developer",
    guildId: "guild-1",
    channelId: "channel-1"
  });
});

test("authorized user can access the seed project", () => {
  const project = projectService.getAccessibleProject(DEVELOPMENT_PROJECT_ID, { userId: ownerId });
  assert.equal(project.id, DEVELOPMENT_PROJECT_ID);
});

test("unauthorized user cannot access the seed project", () => {
  assert.throws(
    () => projectService.getAccessibleProject(DEVELOPMENT_PROJECT_ID, { userId: "other-user" }),
    ProjectAccessDeniedError
  );
});

test("stable project ID and lookup work", () => {
  assert.equal(projectService.getProjectById(DEVELOPMENT_PROJECT_ID).name, "Developer Intelligence Platform");
});

test("project status use case returns the expected response data", async () => {
  const status = await new GetProjectStatus(projectService).execute(
    DEVELOPMENT_PROJECT_ID,
    { userId: ownerId }
  );
  assert.equal(status.status, "Development");
  assert.equal(status.integrations.length, 0);
  assert.deepEqual(status.github, { connected: false, reason: "not_configured" });
});

test("configuration validates required values", () => {
  assert.throws(() => loadConfig({}), ConfigurationError);
  const config = loadConfig({
    DISCORD_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "client-123",
    PORT: "3010"
  });
  assert.equal(config.port, 3010);
});

test("GitHub configuration loads only when complete", () => {
  const config = loadConfig({
    DISCORD_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "client-123",
    GITHUB_TOKEN: "github-token",
    GITHUB_OWNER: "octocat",
    GITHUB_REPOSITORY: "hello-world",
    GITHUB_REPOSITORY_ID: "1296269"
  });
  assert.deepEqual(config.github, {
    token: "github-token",
    owner: "octocat",
    repository: "hello-world",
    repositoryId: "1296269"
  });
  assert.throws(
    () => loadConfig({
      DISCORD_TOKEN: "test-token",
      DISCORD_CLIENT_ID: "client-123",
      GITHUB_TOKEN: "github-token"
    }),
    ConfigurationError
  );
});

test("GitHub client maps successful user and repository responses", async () => {
  const client = new GitHubClient("test-token", (async (input) => {
    const url = String(input);
    if (url.endsWith("/user")) {
      return jsonResponse({ login: "octocat", id: 1, html_url: "https://github.com/octocat" });
    }
    return jsonResponse({
      id: 1296269,
      full_name: "octocat/hello-world",
      private: false,
      default_branch: "main",
      html_url: "https://github.com/octocat/hello-world",
      archived: false,
      disabled: false,
      updated_at: "2026-08-23T00:00:00Z"
    });
  }) as typeof fetch);
  assert.deepEqual(await client.getAuthenticatedUser(), {
    login: "octocat",
    id: 1,
    htmlUrl: "https://github.com/octocat"
  });
  assert.deepEqual(await client.getRepository("octocat", "hello-world"), {
    id: 1296269,
    fullName: "octocat/hello-world",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/octocat/hello-world",
    archived: false,
    disabled: false,
    updatedAt: "2026-08-23T00:00:00Z"
  });
});

test("GitHub service returns safe failure states", async () => {
  const statuses = [
    { response: new Response("", { status: 401 }), expected: "unauthorized" },
    { response: new Response("", { status: 404 }), expected: "not_found" },
    {
      response: new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
      expected: "rate_limited"
    },
    { response: new Response("", { status: 503 }), expected: "unavailable" }
  ] as const;
  for (const { response, expected } of statuses) {
    const service = new GitHubService(
      new GitHubClient("test-token", (async () => response) as typeof fetch)
    );
    assert.deepEqual(
      await service.getRepositoryStatus({ owner: "octocat", repository: "hello-world" }),
      { connected: false, reason: expected }
    );
  }
});

test("GitHub-backed project status returns repository metadata", async () => {
  const project = createSeedProject(ownerId);
  project.integrations.github = { owner: "octocat", repository: "hello-world", repositoryId: "1296269" };
  project.integrationReferences = ["github"];
  const github = new GitHubService(new GitHubClient("test-token", (async (input) => {
    if (String(input).endsWith("/user")) {
      return jsonResponse({ login: "octocat", id: 1, html_url: "https://github.com/octocat" });
    }
    return jsonResponse({
      id: 1296269,
      full_name: "octocat/hello-world",
      private: true,
      default_branch: "main",
      html_url: "https://github.com/octocat/hello-world",
      archived: false,
      disabled: false,
      updated_at: "2026-08-23T00:00:00Z"
    });
  }) as typeof fetch));
  const status = await new GetProjectStatus(
    new ProjectService(new InMemoryProjectRepository(project), github)
  ).execute(DEVELOPMENT_PROJECT_ID, { userId: ownerId });
  assert.equal(status.github?.connected, true);
  assert.equal(status.github?.connected && status.github.repository.fullName, "octocat/hello-world");
});

test("/project status returns expected project information", async () => {
  let response = "";
  const interaction = {
    user: { id: ownerId, username: "owner", globalName: "Owner" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: string) => { response = value; }
  } as never;
  await handleProjectCommand(interaction, new GetProjectStatus(projectService), createLogger());
  assert.match(response, /Developer Intelligence Platform/);
  assert.match(response, /GitHub: Not connected/);
});

test("/project status displays connected GitHub repository safely", async () => {
  const project = createSeedProject(ownerId);
  project.integrations.github = { owner: "octocat", repository: "hello-world" };
  project.integrationReferences = ["github"];
  const github = new GitHubService(new GitHubClient("test-token", (async (input) => {
    if (String(input).endsWith("/user")) {
      return jsonResponse({ login: "octocat", id: 1, html_url: "https://github.com/octocat" });
    }
    return jsonResponse({
      id: 1296269,
      full_name: "octocat/hello-world",
      private: true,
      default_branch: "main",
      html_url: "https://github.com/octocat/hello-world",
      archived: false,
      disabled: false,
      updated_at: "2026-08-23T00:00:00Z"
    });
  }) as typeof fetch));
  let response = "";
  const interaction = {
    user: { id: ownerId, username: "owner", globalName: "Owner" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: string) => { response = value; }
  } as never;
  await handleProjectCommand(
    interaction,
    new GetProjectStatus(new ProjectService(new InMemoryProjectRepository(project), github)),
    createLogger()
  );
  assert.match(response, /GitHub: Connected/);
  assert.match(response, /Repository: octocat\/hello-world/);
  assert.match(response, /Visibility: Private/);
  assert.match(response, /Default Branch: main/);
  assert.match(response, /Repository URL: https:\/\/github.com\/octocat\/hello-world/);
});

test("context records validate bounded scope and source types", () => {
  const record = createContextRecord({
    id: "context-1",
    projectId: DEVELOPMENT_PROJECT_ID,
    scope: "project",
    sourceType: "user_authored",
    sourceIdentity: "manual:1",
    content: "Verified context",
    provenance: {}
  });
  assert.equal(record.scope, "project");
  assert.throws(
    () => createContextRecord({
      ...record,
      id: "invalid-context",
      scope: "global" as never
    }),
    ContextValidationError
  );
  assert.equal(isSecretBearingPath(".env.production"), true);
  assert.equal(isSecretBearingPath("docs/README.md"), false);
});

test("context store filters records and supports deletion", async () => {
  const store = new InMemoryContextStore();
  const base = {
    projectId: DEVELOPMENT_PROJECT_ID,
    scope: "project" as const,
    content: "Context content",
    provenance: {}
  };
  await store.upsert(createContextRecord({
    ...base,
    id: "context-repository",
    sourceType: "github_repository",
    sourceIdentity: "repository:1"
  }));
  await store.upsert(createContextRecord({
    ...base,
    id: "context-documentation",
    sourceType: "github_documentation",
    sourceIdentity: "readme:1"
  }));
  assert.equal((await store.list({ projectId: DEVELOPMENT_PROJECT_ID })).length, 2);
  assert.equal((await store.list({ sourceType: "github_documentation" })).length, 1);
  assert.equal((await store.list({ sourceIdentity: "repository:1" })).length, 1);
  assert.equal(await store.delete("context-documentation"), true);
  assert.equal((await store.list({ projectId: DEVELOPMENT_PROJECT_ID })).length, 1);
});

test("context retrieval enforces project authorization", async () => {
  const store = new InMemoryContextStore();
  const service = new ContextService(store, projectService);
  await service.storeProjectContext({
    id: "protected-context",
    projectId: DEVELOPMENT_PROJECT_ID,
    scope: "project",
    sourceType: "user_authored",
    sourceIdentity: "protected:1",
    content: "Private project context",
    provenance: {}
  });
  assert.equal((await service.getProjectContext(DEVELOPMENT_PROJECT_ID, { userId: ownerId })).length, 1);
  await assert.rejects(
    () => service.getProjectContext(DEVELOPMENT_PROJECT_ID, { userId: "other-user" }),
    ProjectAccessDeniedError
  );
});

test("GitHub ingestion stores repository and README context with provenance idempotently", async () => {
  const project = createSeedProject(ownerId);
  project.integrations.github = { owner: "octocat", repository: "hello-world", repositoryId: "1296269" };
  const github = new GitHubService(new GitHubClient("test-token", (async (input) => {
    const url = String(input);
    if (url.endsWith("/readme")) {
      return jsonResponse({
        path: "README.md",
        sha: "readme-sha",
        html_url: "https://github.com/octocat/hello-world/blob/main/README.md",
        encoding: "base64",
        content: Buffer.from("# Hello World").toString("base64")
      });
    }
    return repositoryResponse();
  }) as typeof fetch));
  const projects = new ProjectService(new InMemoryProjectRepository(project), github);
  const context = new ContextService(new InMemoryContextStore(), projects);
  const ingestion = new GitHubContextIngestionService(projects, context);
  assert.equal((await ingestion.ingestProject(project)).ingested, 2);
  assert.equal((await ingestion.ingestProject(project)).ingested, 2);
  const records = await context.getProjectContext(DEVELOPMENT_PROJECT_ID, { userId: ownerId });
  assert.equal(records.length, 2);
  const readme = records.find((record) => record.sourceType === "github_documentation");
  assert.equal(readme?.content, "# Hello World");
  assert.deepEqual(readme?.provenance, {
    repositoryOwner: "octocat",
    repositoryName: "hello-world",
    repositoryId: "1296269",
    filePath: "README.md",
    sourceUrl: "https://github.com/octocat/hello-world/blob/main/README.md",
    sourceReference: "readme-sha"
  });
});

test("GitHub ingestion handles failures without storing fabricated context", async () => {
  const project = createSeedProject(ownerId);
  project.integrations.github = { owner: "octocat", repository: "hello-world" };
  const github = new GitHubService(
    new GitHubClient("test-token", (async () => new Response("", { status: 503 })) as typeof fetch)
  );
  const projects = new ProjectService(new InMemoryProjectRepository(project), github);
  const context = new ContextService(new InMemoryContextStore(), projects);
  const result = await new GitHubContextIngestionService(projects, context).ingestProject(project);
  assert.deepEqual(result, { ingested: 0, updated: 0, reason: "unavailable" });
  assert.equal((await context.getProjectContext(DEVELOPMENT_PROJECT_ID, { userId: ownerId })).length, 0);
});

test("/context project returns a project-scoped source summary", async () => {
  const project = createSeedProject(ownerId);
  project.integrations.github = { owner: "octocat", repository: "hello-world" };
  const github = new GitHubService(new GitHubClient("test-token", (async (input) => {
    if (String(input).endsWith("/readme")) {
      return jsonResponse({
        path: "README.md",
        sha: "readme-sha",
        html_url: "https://github.com/octocat/hello-world/blob/main/README.md",
        encoding: "base64",
        content: Buffer.from("# Hello World").toString("base64")
      });
    }
    return repositoryResponse();
  }) as typeof fetch));
  const projects = new ProjectService(new InMemoryProjectRepository(project), github);
  const context = new ContextService(new InMemoryContextStore(), projects);
  const getProjectContext = new GetProjectContext(
    projects,
    context,
    new GitHubContextIngestionService(projects, context)
  );
  let response = "";
  const interaction = {
    user: { id: ownerId, username: "owner", globalName: "Owner" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: string) => { response = value; }
  } as never;
  await handleContextCommand(interaction, getProjectContext, createLogger());
  assert.match(response, /Context records: 2/);
  assert.match(response, /github_repository/);
  assert.match(response, /README.md/);
});

test("/context project rejects unauthorized users safely", async () => {
  const context = new ContextService(new InMemoryContextStore(), projectService);
  const getProjectContext = new GetProjectContext(
    projectService,
    context,
    new GitHubContextIngestionService(projectService, context)
  );
  let response: unknown;
  const interaction = {
    user: { id: "other-user", username: "other", globalName: "Other" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: unknown) => { response = value; }
  } as never;
  await handleContextCommand(interaction, getProjectContext, createLogger());
  assert.deepEqual(response, {
    content: "You are not authorized to view this project context.",
    ephemeral: true
  });
});

test("reality records validate fact and verification states", () => {
  const record = createRealityRecord({
    id: "reality-1",
    projectId: DEVELOPMENT_PROJECT_ID,
    factType: "project_identity",
    value: { name: "Developer Intelligence Platform" },
    verificationState: "verified"
  });
  assert.equal(record.verificationState, "verified");
  assert.throws(
    () => createRealityRecord({
      ...record,
      id: "reality-invalid",
      factType: "unknown" as never
    }),
    RealityValidationError
  );
});

test("reality service stores, updates, filters, and invalidates project facts", async () => {
  const reality = new RealityService(new InMemoryRealityStore(), projectService);
  const input = {
    id: "reality-status",
    projectId: DEVELOPMENT_PROJECT_ID,
    factType: "project_status" as const,
    value: { status: "Development" },
    verificationState: "verified" as const
  };
  await reality.establishFact(input, { userId: ownerId });
  assert.equal(
    (await reality.getProjectReality(DEVELOPMENT_PROJECT_ID, { userId: ownerId })).length,
    1
  );
  await reality.updateFact({
    ...input,
    value: { status: "Paused" },
    verificationState: "pending"
  }, { userId: ownerId });
  assert.equal(
    (await reality.getProjectReality(
      DEVELOPMENT_PROJECT_ID,
      { userId: ownerId },
      { verificationState: "pending" }
    ))[0]?.value.status,
    "Paused"
  );
  const invalidated = await reality.invalidateFact("reality-status", { userId: ownerId });
  assert.equal(invalidated?.verificationState, "invalidated");
});

test("reality facts can reference same-project context but never promote it automatically", async () => {
  const context = new ContextService(new InMemoryContextStore(), projectService);
  await context.storeProjectContext({
    id: "context-evidence",
    projectId: DEVELOPMENT_PROJECT_ID,
    scope: "project",
    sourceType: "github_repository",
    sourceIdentity: "github:repository:1",
    content: "Repository metadata",
    provenance: { repositoryName: "hello-world" }
  });
  const reality = new RealityService(new InMemoryRealityStore(), projectService, context);
  const fact = await reality.establishFact({
    id: "reality-repository",
    projectId: DEVELOPMENT_PROJECT_ID,
    factType: "github_repository",
    value: { repository: "hello-world" },
    verificationState: "verified",
    supportingContextId: "context-evidence"
  }, { userId: ownerId });
  assert.equal(fact.supportingContextId, "context-evidence");
  assert.equal(
    (await reality.getProjectReality(DEVELOPMENT_PROJECT_ID, { userId: ownerId })).length,
    1
  );
  await assert.rejects(
    () => reality.establishFact({
      ...fact,
      id: "reality-invalid-evidence",
      supportingContextId: "missing-context"
    }, { userId: ownerId })
  );
});

test("reality access keeps projects isolated", async () => {
  const projectA = createSeedProject(ownerId);
  const projectB = { ...createSeedProject("owner-456"), id: "project-b" };
  const projects = new ProjectService({
    findById: (id) => id === projectA.id ? projectA : id === projectB.id ? projectB : undefined
  });
  const reality = new RealityService(new InMemoryRealityStore(), projects);
  await reality.establishFact({
    id: "reality-project-b",
    projectId: projectB.id,
    factType: "project_status",
    value: { status: "Development" },
    verificationState: "verified"
  }, { userId: "owner-456" });
  await assert.rejects(
    () => reality.getProjectReality(projectB.id, { userId: ownerId }),
    ProjectAccessDeniedError
  );
});

test("/reality project returns verified deterministic project facts", async () => {
  const reality = new RealityService(new InMemoryRealityStore(), projectService);
  const getProjectReality = new GetProjectReality(
    projectService,
    reality,
    new ProjectRealityBootstrap(reality)
  );
  let response = "";
  const interaction = {
    user: { id: ownerId, username: "owner", globalName: "Owner" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: string) => { response = value; }
  } as never;
  await handleRealityCommand(interaction, getProjectReality, createLogger());
  assert.match(response, /Verified reality facts: 2/);
  assert.match(response, /project_identity \[verified\]/);
  assert.match(response, /project_status \[verified\]/);
});

test("/reality project rejects unauthorized users safely", async () => {
  const reality = new RealityService(new InMemoryRealityStore(), projectService);
  const getProjectReality = new GetProjectReality(
    projectService,
    reality,
    new ProjectRealityBootstrap(reality)
  );
  let response: unknown;
  const interaction = {
    user: { id: "other-user", username: "other", globalName: "Other" },
    guildId: "guild-1",
    channelId: "channel-1",
    options: { getString: () => DEVELOPMENT_PROJECT_ID },
    reply: async (value: unknown) => { response = value; }
  } as never;
  await handleRealityCommand(interaction, getProjectReality, createLogger());
  assert.deepEqual(response, {
    content: "You are not authorized to view this project reality.",
    ephemeral: true
  });
});

test("health endpoint responds successfully", async () => {
  const server = startHealthServer(0, createLogger());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function repositoryResponse(): Response {
  return jsonResponse({
    id: 1296269,
    full_name: "octocat/hello-world",
    private: true,
    default_branch: "main",
    html_url: "https://github.com/octocat/hello-world",
    archived: false,
    disabled: false,
    updated_at: "2026-08-23T00:00:00Z"
  });
}