import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { AiProviderUnavailableError } from "../ai/ai-service.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import type { Logger } from "../logging.js";
import { GetProjectExplanation } from "../use-cases/project-explanation.js";
import { setProjectAutocomplete } from "./project-autocomplete.js";

export const explainCommand = new SlashCommandBuilder()
  .setName("explain")
  .setDescription("Explain a project using bounded authorized evidence")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("project")
      .setDescription("Explain the current project state")
      .addStringOption((option) => setProjectAutocomplete(option, "Project ID or name"))
  );

export async function handleExplainCommand(
  interaction: ChatInputCommandInteraction,
  getProjectExplanation: GetProjectExplanation,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const explanation = await getProjectExplanation.execute(projectId, identity);
    await interaction.reply({ content: explanation.text.slice(0, 1900), ephemeral: true });
    logger.info("command.completed", { command: "explain.project", userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to explain this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
          : error instanceof AiProviderUnavailableError
            ? "Project explanations are not available until an AI provider is configured."
            : "The project explanation could not be completed safely.";
    logger.error("command.failed", {
      command: "explain.project",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}