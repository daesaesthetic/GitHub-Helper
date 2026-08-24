import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import type { Logger } from "../logging.js";

export const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Show first-run setup status");

export async function handleSetupCommand(
  interaction: ChatInputCommandInteraction,
  authorizedUserId: string,
  config: { githubConfigured: boolean; githubAppConfigured: boolean },
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  if (identity.userId !== authorizedUserId) {
    await interaction.reply({ ephemeral: true, content: "This personal bot is restricted to its configured owner." });
    return;
  }
  await interaction.reply({ ephemeral: true, content: [
    "**Setup status**",
    "Owner access: configured",
    `Development GitHub access: ${config.githubConfigured ? "configured" : "not configured"}`,
    `GitHub App access: ${config.githubAppConfigured ? "configured" : "optional and not configured"}`,
    config.githubConfigured
      ? "Ready: project status, Context, Activity, Trends, and Intelligence can use the development token."
      : "Next step: add GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPOSITORY as secure environment values.",
    "No public deployment is required for the token-only development path."
  ].join("\n") });
  logger.info("command.completed", { command: "setup", userId: identity.userId });
}