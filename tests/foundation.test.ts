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

test("project status use case returns the expected response data", () => {
  const status = new GetProjectStatus(projectService).execute(
    DEVELOPMENT_PROJECT_ID,
    { userId: ownerId }
  );
  assert.equal(status.status, "Development");
  assert.equal(status.integrations.length, 0);
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