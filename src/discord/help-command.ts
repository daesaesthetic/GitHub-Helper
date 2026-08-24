import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import type { Logger } from "../logging.js";

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show the bot's commands");

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
  authorizedUserId: string,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  if (identity.userId !== authorizedUserId) {
    await interaction.reply({ ephemeral: true, content: "This personal bot is restricted to its configured owner." });
    return;
  }
  await interaction.reply({ ephemeral: true, content: [
    "**Developer Intelligence Platform**",
    "Owner-only project operations:",
    "- `/project status` — current project and repository status",
    "- `/activity project` — recent commits, issues, and pull requests",
    "- `/trends project` — bounded 30-day development trends",
    "- `/context project` — refresh and inspect repository context",
    "- `/reality project` — verified project facts",
    "- `/intelligence project` — consolidated deterministic summary",
     "- `/explain project` — grounded explanation when an AI provider is configured",
     "- `/secrets list` — configured secret metadata only; values are never shown",
    "- `/milestone list|create|update|status|delete` — explicit milestones",
    "- `/github status|repositories|disconnect` — connection management",
    "Use `/github connect` only if GitHub App configuration is later supplied."
  ].join("\n") });
  logger.info("command.completed", { command: "help", userId: identity.userId });
}