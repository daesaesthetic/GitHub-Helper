import type { ChatInputCommandInteraction } from "discord.js";

export interface RequestIdentity {
  userId: string;
  username?: string;
  displayName?: string;
  guildId?: string;
  channelId?: string;
}

export function extractIdentity(interaction: Pick<
  ChatInputCommandInteraction,
  "user" | "guildId" | "channelId"
>): RequestIdentity {
  return {
    userId: interaction.user.id,
    username: interaction.user.username,
    displayName: interaction.user.globalName ?? interaction.user.username,
    guildId: interaction.guildId ?? undefined,
    channelId: interaction.channelId ?? undefined
  };
}