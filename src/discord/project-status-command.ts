import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { extractIdentity } from "../identity.js";
import { GetProjectStatus } from "../use-cases/project-status.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import type { Logger } from "../logging.js";
import { setProjectAutocomplete } from "./project-autocomplete.js";

export const projectStatusCommand = new SlashCommandBuilder()
  .setName("project")
  .setDescription("Inspect a project")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("View project status")
        .addStringOption((option) => setProjectAutocomplete(option))
   )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List your projects")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a GitHub repository as a project")
      .addStringOption((option) => option.setName("owner").setDescription("GitHub owner or organization").setRequired(true))
      .addStringOption((option) => option.setName("repository").setDescription("GitHub repository name").setRequired(true))
      .addStringOption((option) => option.setName("name").setDescription("Project display name"))
  );

export async function handleProjectCommand(
  interaction: ChatInputCommandInteraction,
  getProjectStatus: GetProjectStatus,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const action = interaction.options.getSubcommand?.() ?? "status";
  const projectId = interaction.options.getString("project") ?? DEVELOPMENT_PROJECT_ID;
  try {
    if (action === "list") {
      const projects = getProjectStatus.projects.getAccessibleProjects(identity);
      await interaction.reply(projects.length
        ? projects.map((project) => `- **${project.name}** — \`${project.id}\``).join("\n")
        : "No projects configured yet.");
      return;
    }
    if (action === "add") {
      const owner = interaction.options.getString("owner", true);
      const repository = interaction.options.getString("repository", true);
      const name = interaction.options.getString("name") ?? `${owner}/${repository}`;
      const project = await getProjectStatus.projects.createGitHubProject({
        owner,
        repository,
        name
      }, identity);
      await interaction.reply(`Project added: **${project.name}**\nID: \`${project.id}\``);
      return;
    }
    const result = await getProjectStatus.execute(projectId, identity);
    logger.info("command.completed", { command: "project.status", userId: identity.userId, projectId });
    await interaction.reply([
      `**${result.name}**`,
      `Status: ${result.status}`,
      result.description,
      `Owner: <@${result.ownerId}>`,
      formatGitHub(result)
    ].join("\n"));
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
        : action === "add"
          ? "Unable to add that GitHub repository. Check the owner, repository name, and GitHub access."
        : "Unable to retrieve project status right now.";
    logger.error("command.failed", {
      command: "project.status",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatGitHub(result: Awaited<ReturnType<GetProjectStatus["execute"]>>): string {
  if (!result.github || !result.github.connected) {
    return result.github?.reason === "not_configured"
      ? "GitHub: Not configured\nConfigure development GitHub access or use /github connect when GitHub App authorization is available."
      : "GitHub: Unavailable\nRepository status could not be established right now.";
  }
  const repository = result.github.repository;
  return [
    "GitHub: Connected",
    `Repository: ${repository.fullName}`,
    `Visibility: ${repository.private ? "Private" : "Public"}`,
    `Default Branch: ${repository.defaultBranch}`,
    `Repository URL: ${repository.htmlUrl}`,
    `Repository Status: ${repository.archived ? "Archived" : repository.disabled ? "Disabled" : "Active"}`
  ].join("\n");
}