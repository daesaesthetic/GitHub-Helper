import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import { GetProjectActivity } from "../use-cases/project-activity.js";
import type { Logger } from "../logging.js";

export const activityCommand = new SlashCommandBuilder()
  .setName("activity")
  .setDescription("Inspect recent GitHub development activity")
  .addSubcommand((subcommand) => subcommand
    .setName("project")
    .setDescription("View recent commits, issues, and pull requests")
    .addStringOption((option) => option
      .setName("project")
      .setDescription("Project to inspect")
      .setRequired(true)
      .addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })));

export async function handleActivityCommand(
  interaction: ChatInputCommandInteraction,
  getProjectActivity: GetProjectActivity,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectActivity.execute(projectId, identity);
    await interaction.reply({ ephemeral: true, content: formatActivity(result) });
    logger.info("command.completed", { command: "activity.project", userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project activity."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : "GitHub activity is unavailable right now. Please try again later.";
    logger.error("command.failed", { command: "activity.project", userId: identity.userId, projectId, error: error instanceof Error ? error.name : "UnknownError" });
    await interaction.reply({ ephemeral: true, content: message });
  }
}

function formatActivity(result: Awaited<ReturnType<GetProjectActivity["execute"]>>): string {
  if (!result.connected) {
    return `GitHub Development\nActivity: ${result.reason === "not_configured" ? "not configured" : `unavailable (${result.reason})`}`;
  }
  const commits = result.commits.slice(0, 3).map((item) => `- Commit ${item.sha.slice(0, 7)}: ${item.message}`);
  const issues = result.issues.slice(0, 3).map((item) => `- Issue #${item.number} [${item.state}]: ${item.title}`);
  const pullRequests = result.pullRequests.slice(0, 3).map((item) => `- PR #${item.number} [${item.state}]: ${item.title}`);
  return [
    "GitHub Development",
    `Retrieved: ${formatTimestamp(result.retrievedAt)}`,
    `Commits: ${result.commits.length}`,
    ... (commits.length ? commits : ["- No recent commits observed"]),
    `Issues: ${result.issues.length}`,
    ... (issues.length ? issues : ["- No recent issues observed"]),
    `Pull requests: ${result.pullRequests.length}`,
    ... (pullRequests.length ? pullRequests : ["- No recent pull requests observed"])
  ].join("\n");
}

function formatTimestamp(timestamp: string): string {
  return timestamp.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}