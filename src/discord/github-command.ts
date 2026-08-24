import { ChatInputCommandInteraction, StringSelectMenuBuilder, ActionRowBuilder, SlashCommandBuilder } from "discord.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { GitHubAppConfigurationError, GitHubAppService } from "../github-connections/github-app-service.js";
import type { Logger } from "../logging.js";

export const githubCommand = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Connect a project to GitHub")
  .addSubcommand((subcommand) => subcommand
    .setName("connect")
    .setDescription("Start a secure GitHub App connection")
    .addStringOption((option) => option
      .setName("project")
      .setDescription("Project to connect")
      .setRequired(true)
      .addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })));
githubCommand.addSubcommand((subcommand) => subcommand.setName("status").setDescription("View GitHub connection status").addStringOption((option) => option.setName("project").setDescription("Project").setRequired(true).addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })));
githubCommand.addSubcommand((subcommand) => subcommand.setName("repositories").setDescription("Choose an accessible GitHub repository").addStringOption((option) => option.setName("project").setDescription("Project").setRequired(true).addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })));
githubCommand.addSubcommand((subcommand) => subcommand.setName("disconnect").setDescription("Disconnect your user-owned GitHub installation"));

export async function handleGitHubCommand(
  interaction: ChatInputCommandInteraction,
  app: GitHubAppService,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project") ?? DEVELOPMENT_PROJECT_ID;
  try {
    if (interaction.options.getSubcommand() === "status") {
      const result = await app.status(projectId, identity);
      const lifecycle = result.connection?.status;
      const lifecycleMessage = lifecycle === "revoked"
        ? "The connected GitHub installation is no longer available.\nPlease reconnect GitHub to restore access."
        : lifecycle === "suspended"
          ? "The connected GitHub installation is currently unavailable."
          : undefined;
      await interaction.reply({ ephemeral: true, content: result.connection
        ? [`GitHub connection: ${lifecycle === "active" ? "Active" : lifecycle === "disconnected" ? "Disconnected" : lifecycle === "revoked" ? "Revoked" : "Suspended"}`, lifecycleMessage, `Account: ${result.connection.githubAccountLogin ?? "Unknown"}`, result.association ? `Repository: ${result.association.owner}/${result.association.repository}` : "Repository: None"].filter(Boolean).join("\n")
        : "This project has no user-owned GitHub installation. Development GitHub configuration, if available, is separate." });
      return;
    }
    if (interaction.options.getSubcommand() === "disconnect") {
      const disconnected = await app.disconnect(identity);
      await interaction.reply({ ephemeral: true, content: disconnected ? "Your GitHub installation was disconnected. Existing project data was preserved." : "No user-owned GitHub installation is connected." });
      return;
    }
    if (interaction.options.getSubcommand() === "repositories") {
      const result = await app.discoverRepositories(projectId, identity);
      if (!result.repositories.length) {
        await interaction.reply({ ephemeral: true, content: "No repositories are accessible through the connected GitHub installation." });
        return;
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`github.repositories:${projectId}:${result.connection.id}`)
        .setPlaceholder("Select a repository")
        .addOptions(result.repositories.slice(0, 25).map((repo) => ({ label: repo.fullName.slice(0, 100), value: String(repo.id), description: repo.private ? "Private repository" : "Public repository" })));
      await interaction.reply({ ephemeral: true, content: "Select the repository to associate with this project:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
      return;
    }
    const url = await app.createConnectUrl(projectId, identity);
    await interaction.reply({
      ephemeral: true,
      content: [
        "Open this link to install and authorize GitHub access for this project:",
        url,
        "Return to Discord after GitHub confirms the connection."
      ].join("\n")
    });
    logger.info("command.completed", { command: "github.connect", userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to connect GitHub for this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof GitHubAppConfigurationError
          ? "GitHub App connections are not configured yet. Existing development GitHub access is unchanged."
          : "Unable to start GitHub authorization right now.";
    logger.error("command.failed", {
      command: "github.connect",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

export async function handleGitHubRepositorySelection(
  interaction: import("discord.js").StringSelectMenuInteraction,
  app: GitHubAppService,
  logger: Logger
) {
  const identity = extractIdentity(interaction);
  const [, projectId, connectionId] = interaction.customId.split(":");
  try {
    const association = await app.selectRepository(projectId, connectionId, Number(interaction.values[0]), identity);
    await interaction.update({ content: `Repository **${association.owner}/${association.repository}** is now associated with the project.`, components: [] });
  } catch (error) {
    logger.error("command.failed", { command: "github.repositories.select", userId: identity.userId, error: error instanceof Error ? error.name : "UnknownError" });
    await interaction.update({ content: "That repository selection is no longer valid or accessible.", components: [] });
  }
}