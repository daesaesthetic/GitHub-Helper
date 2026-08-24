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
    "**GitHub Activity**",
    formatActivity(result),
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

function formatActivity(result: Awaited<ReturnType<GetProjectIntelligence["execute"]>>): string {
  if (!result.activity.connected) return `- Unavailable: ${result.activity.reason}`;
  const latestCommit = result.activity.commits[0];
  const openIssues = result.activity.issues.filter((issue) => issue.state === "open").length;
  const openPullRequests = result.activity.pullRequests.filter((pullRequest) => pullRequest.state === "open").length;
  return [
    `- Recent commits: ${result.activity.commits.length}`,
    `- Recent issues: ${result.activity.issues.length} (${openIssues} open)`,
    `- Recent pull requests: ${result.activity.pullRequests.length} (${openPullRequests} open)`,
    latestCommit
      ? `- Latest commit: ${latestCommit.message} (${formatTimestamp(latestCommit.timestamp)})`
      : "- Latest commit: None found",
    `- Activity retrieved: ${formatTimestamp(result.activity.retrievedAt)}`
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