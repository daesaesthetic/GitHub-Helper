import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import type { Logger } from "../logging.js";
import { GetProjectSecrets } from "../use-cases/project-secrets.js";
import { setProjectAutocomplete } from "./project-autocomplete.js";

export const secretsCommand = new SlashCommandBuilder()
  .setName("secrets")
  .setDescription("Inspect secret metadata without revealing secret values")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List configured secret metadata")
      .addStringOption((option) => setProjectAutocomplete(option, "Project ID or name"))
  );

export async function handleSecretsCommand(
  interaction: ChatInputCommandInteraction,
  getProjectSecrets: GetProjectSecrets,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const secrets = await getProjectSecrets.execute(projectId, identity);
    const content = secrets.length === 0
      ? "No configured secret metadata is available for this project."
      : [
        `Configured secret metadata: ${secrets.length}`,
        ...secrets.slice(0, 25).map((secret) => `- ${secret.name} — ${secret.provider} — configured`)
      ].join("\n");
    await interaction.reply({ content, ephemeral: true });
    logger.info("command.completed", { command: "secrets.list", userId: identity.userId, projectId, count: secrets.length });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view secret metadata for this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
          : "Secret metadata is unavailable right now.";
    logger.error("command.failed", {
      command: "secrets.list",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}