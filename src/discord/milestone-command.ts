import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandStringOption
} from "discord.js";
import { extractIdentity } from "../identity.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import {
  CurrentMilestoneConflictError,
  MilestoneNotFoundError,
  MilestoneService
} from "../milestones/milestone-service.js";
import { MilestoneValidationError } from "../milestones/milestone.js";
import type { Logger } from "../logging.js";
import { setProjectAutocomplete } from "./project-autocomplete.js";

const statuses = [
  { name: "Current", value: "current" },
  { name: "Upcoming", value: "upcoming" },
  { name: "Completed", value: "completed" }
] as const;

function projectOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return setProjectAutocomplete(option, "Project ID or name to manage");
}

export const milestoneCommand = new SlashCommandBuilder()
  .setName("milestone")
  .setDescription("Manage project milestones")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List project milestones")
      .addStringOption(projectOption)
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a project milestone")
      .addStringOption(projectOption)
      .addStringOption((option) => option.setName("title").setDescription("Milestone title").setRequired(true))
      .addStringOption((option) =>
        option.setName("status").setDescription("Milestone status").addChoices(...statuses)
      )
      .addStringOption((option) => option.setName("description").setDescription("Optional notes"))
      .addIntegerOption((option) => option.setName("position").setDescription("Display order").setMinValue(0))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("update")
      .setDescription("Update milestone details")
      .addStringOption(projectOption)
      .addStringOption((option) => option.setName("id").setDescription("Milestone ID").setRequired(true))
      .addStringOption((option) => option.setName("title").setDescription("Updated title"))
      .addStringOption((option) => option.setName("description").setDescription("Updated notes"))
      .addIntegerOption((option) => option.setName("position").setDescription("Updated display order").setMinValue(0))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Change milestone status")
      .addStringOption(projectOption)
      .addStringOption((option) => option.setName("id").setDescription("Milestone ID").setRequired(true))
      .addStringOption((option) =>
        option.setName("status").setDescription("New status").setRequired(true).addChoices(...statuses)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Remove a milestone")
      .addStringOption(projectOption)
      .addStringOption((option) => option.setName("id").setDescription("Milestone ID").setRequired(true))
  );

export async function handleMilestoneCommand(
  interaction: ChatInputCommandInteraction,
  milestones: MilestoneService,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  const action = interaction.options.getSubcommand();
  try {
    if (action === "list") {
      const records = await milestones.getProjectMilestones(projectId, identity);
      await interaction.reply(formatMilestones(records));
    } else if (action === "create") {
      const milestone = await milestones.create({
        projectId,
        title: interaction.options.getString("title", true),
        status: (interaction.options.getString("status") ?? "upcoming") as "current" | "upcoming" | "completed",
        description: interaction.options.getString("description") ?? undefined,
        position: interaction.options.getInteger("position") ?? undefined
      }, identity);
      await interaction.reply(`Milestone created: **${milestone.title}** (${milestone.status})\nID: \`${milestone.id}\``);
    } else if (action === "update") {
      const title = interaction.options.getString("title") ?? undefined;
      const description = interaction.options.getString("description") ?? undefined;
      const position = interaction.options.getInteger("position") ?? undefined;
      if (title === undefined && description === undefined && position === undefined) {
        throw new MilestoneValidationError("Provide a title, description, or position to update");
      }
      const milestone = await milestones.update(
        interaction.options.getString("id", true),
        { title, description, position },
        identity
      );
      await interaction.reply(`Milestone updated: **${milestone.title}**`);
    } else if (action === "status") {
      const milestone = await milestones.changeStatus(
        interaction.options.getString("id", true),
        interaction.options.getString("status", true) as "current" | "upcoming" | "completed",
        identity
      );
      await interaction.reply(`Milestone status updated: **${milestone.title}** is now ${milestone.status}.`);
    } else {
      const deleted = await milestones.remove(interaction.options.getString("id", true), identity);
      await interaction.reply(deleted ? "Milestone removed." : "Milestone was not found.");
    }
    logger.info("command.completed", { command: `milestone.${action}`, userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to manage milestones for this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
        : error instanceof MilestoneNotFoundError
          ? "That milestone could not be found."
          : error instanceof CurrentMilestoneConflictError
            ? "This project already has a current milestone."
              : error instanceof MilestoneValidationError
                ? error.message
            : "Unable to manage project milestones right now.";
    logger.error("command.failed", {
      command: `milestone.${action}`,
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatMilestones(records: Awaited<ReturnType<MilestoneService["getProjectMilestones"]>>): string {
  if (records.length === 0) return "Milestones: none configured.";
  return [
    `Milestones: ${records.length}`,
    ...records.map((milestone) =>
      `- [${milestone.status}] ${milestone.title} (position ${milestone.position}) — \`${milestone.id}\``
    )
  ].join("\n");
}