import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import type { Logger } from "../logging.js";
import { GetProjectIntelligence } from "../use-cases/project-intelligence.js";

export const intelligenceCommand = new SlashCommandBuilder()
  .setName("intelligence")
  .setDescription("Inspect deterministic project intelligence")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("project")
      .setDescription("View project intelligence")
      .addStringOption((option) =>
        option
          .setName("project")
          .setDescription("Project to inspect")
          .setRequired(true)
          .addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })
      )
  );

export async function handleIntelligenceCommand(
  interaction: ChatInputCommandInteraction,
  getProjectIntelligence: GetProjectIntelligence,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectIntelligence.execute(projectId, identity);
    logger.info("command.completed", {
      command: "intelligence.project",
      userId: identity.userId,
      projectId,
      health: result.health.state
    });
    await interaction.reply(formatIntelligence(result));
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project intelligence."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : "Unable to retrieve project intelligence right now.";
    logger.error("command.failed", {
      command: "intelligence.project",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatIntelligence(result: Awaited<ReturnType<GetProjectIntelligence["execute"]>>): string {
  const lines = [
    `**${result.project.name}**`,
    `State: ${result.state.value} (${result.state.source})`,
    `Health: ${result.health.state}`,
    "",
    "**Health reasons**",
    ...result.health.reasons.map((reason) => `- ${reason.message}`),
    "",
    "**Repository**",
    formatGitHub(result),
    "",
    "**GitHub Development**",
    formatDevelopment(result),
    "",
    "**Development Trends**",
    formatTrends(result),
    "",
    "**Verified Reality**",
    ...(result.verifiedFacts.length > 0
      ? result.verifiedFacts.map((fact) => `- ${fact.factType}: ${formatValue(fact.value)}`)
      : ["- No verified Reality facts are available."]),
    "",
    "**Milestones**",
    result.milestone.status === "established"
      ? `- Current: ${result.milestone.current ?? "Not established"}`
      : `- Unavailable: ${result.milestone.reason}`,
    "",
    "**Supporting Context evidence**",
    ...(result.supportingEvidence.length > 0
      ? result.supportingEvidence.slice(0, 5).map((evidence) => `- ${evidence.sourceType}: ${evidence.reference}`)
      : ["- No supporting Context evidence is available."])
  ];
  return lines.join("\n");
}

function formatDevelopment(result: Awaited<ReturnType<GetProjectIntelligence["execute"]>>): string {
  if (result.development.status === "unavailable") {
    return `- Unavailable: ${result.development.reason}`;
  }
  const repository = result.development.repository!;
  if (result.development.activity.status === "unavailable") {
    return [
      `- ${repository.fullName}`,
      `- Default branch: ${repository.defaultBranch}`,
      `- Visibility: ${repository.visibility === "private" ? "Private" : "Public"}`,
      `- Activity: Unavailable (${result.development.activity.reason})`
    ].join("\n");
  }
  const activity = result.development.activity;
  return [
    `- ${repository.fullName}`,
    `- Default branch: ${repository.defaultBranch}`,
    `- Visibility: ${repository.visibility === "private" ? "Private" : "Public"}`,
    `- Recent commits: ${activity.recentCommitCount}`,
    `- Recent issues: ${activity.recentIssueCount} (${activity.openIssueCount} open)`,
    `- Recent pull requests: ${activity.recentPullRequestCount} (${activity.openPullRequestCount} open)`,
    activity.latestCommit
      ? `- Latest commit: ${activity.latestCommit.message} (${formatTimestamp(activity.latestCommit.timestamp)})`
      : "- Latest commit: None found",
    activity.latestCommit?.ageSeconds !== undefined
      ? `- Activity age: ${formatAge(activity.latestCommit.ageSeconds)}`
      : "- Activity age: Unavailable",
    `- Activity retrieved: ${formatTimestamp(activity.retrievedAt)}`
  ].join("\n");
}

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86400)}d`;
}

function formatTrends(result: Awaited<ReturnType<GetProjectIntelligence["execute"]>>): string {
  const trends = result.trends;
  const windowDays = Math.round(trends.window.durationSeconds / 86400);
  if (trends.status === "unavailable") {
    return [
      `- Window: last ${windowDays} days`,
      "- Activity: unavailable",
      `- Reason: ${trends.reason}`
    ].join("\n");
  }
  return [
    `- Window: last ${windowDays} days`,
    `- Commits observed: ${trends.observed!.commits}`,
    `- Issues observed: ${trends.observed!.issues}`,
    `- Pull requests observed: ${trends.observed!.pullRequests}`,
    `- Activity: ${trends.classification}`,
    `- Coverage: ${trends.coverage}`
  ].join("\n");
}

function formatTimestamp(timestamp: string): string {
  return timestamp.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatGitHub(result: Awaited<ReturnType<GetProjectIntelligence["execute"]>>): string {
  if (!result.github.connected) return `- ${result.github.reason}`;
  const repository = result.github.repository;
  return [
    `- ${repository.fullName}`,
    `- Visibility: ${repository.private ? "Private" : "Public"}`,
    `- Default branch: ${repository.defaultBranch}`,
    `- Status: ${repository.archived ? "Archived" : repository.disabled ? "Disabled" : "Active"}`
  ].join("\n");
}

function formatValue(value: Record<string, string>): string {
  return Object.entries(value).map(([key, item]) => `${key}=${item}`).join(", ");
}