import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import { GetProjectTrends } from "../use-cases/project-trends.js";
import type { Logger } from "../logging.js";

export const trendsCommand = new SlashCommandBuilder()
  .setName("trends")
  .setDescription("Inspect bounded GitHub development trends")
  .addSubcommand((subcommand) => subcommand
    .setName("project")
    .setDescription("View observed GitHub trends for the last 30 days")
    .addStringOption((option) => option
      .setName("project")
      .setDescription("Project to inspect")
      .setRequired(true)));

export async function handleTrendsCommand(
  interaction: ChatInputCommandInteraction,
  getProjectTrends: GetProjectTrends,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectTrends.execute(projectId, identity);
    await interaction.reply({ ephemeral: true, content: formatTrends(result) });
    logger.info("command.completed", { command: "trends.project", userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project's trends."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : "GitHub trends are unavailable right now. Please try again later.";
    logger.error("command.failed", { command: "trends.project", userId: identity.userId, projectId, error: error instanceof Error ? error.name : "UnknownError" });
    await interaction.reply({ ephemeral: true, content: message });
  }
}

function formatTrends(result: Awaited<ReturnType<GetProjectTrends["execute"]>>): string {
  const days = Math.round(result.window.durationSeconds / 86400);
  if (result.status === "unavailable") {
    return [`Development Trends`, `Window: last ${days} days`, `Activity: unavailable (${result.reason})`].join("\n");
  }
  return [
    "Development Trends",
    `Window: last ${days} days`,
    `Commits observed: ${result.observed?.commits ?? 0}`,
    `Issues observed: ${result.observed?.issues ?? 0}`,
    `Pull requests observed: ${result.observed?.pullRequests ?? 0}`,
    `Open issues: ${result.observed?.openIssues ?? 0}`,
    `Open pull requests: ${result.observed?.openPullRequests ?? 0}`,
    `Classification: ${result.classification}`,
    `Coverage: ${result.coverage}`,
    "Counts are bounded observations, not complete historical totals."
  ].join("\n");
}