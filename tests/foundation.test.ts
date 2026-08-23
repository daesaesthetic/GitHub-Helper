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
      disabled: false
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
    disabled: false
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
      disabled: false
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
      disabled: false
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