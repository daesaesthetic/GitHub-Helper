import type { AutocompleteInteraction } from "discord.js";
import type { ProjectService } from "../projects/project-service.js";
import type { RequestIdentity } from "../identity.js";

export function setProjectAutocomplete<T extends {
  setName(name: string): T;
  setDescription(description: string): T;
  setRequired(required: boolean): T;
  setAutocomplete(autocomplete: boolean): T;
}>(option: T, description = "Project ID or name"): T {
  return option
    .setName("project")
    .setDescription(description)
    .setRequired(true)
    .setAutocomplete(true);
}

export async function handleProjectAutocomplete(
  interaction: AutocompleteInteraction,
  projects: ProjectService,
  identity: RequestIdentity
): Promise<void> {
  const focused = interaction.options.getFocused().trim().toLowerCase();
  const choices = projects
    .getAccessibleProjects(identity)
    .filter((project) =>
      !focused ||
      project.name.toLowerCase().includes(focused) ||
      project.id.toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map((project) => ({
      name: `${project.name} (${project.id})`.slice(0, 100),
      value: project.id
    }));

  await interaction.respond(choices);
}