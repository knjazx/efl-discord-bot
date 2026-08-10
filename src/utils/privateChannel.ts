import {
  Guild,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  OverwriteResolvable,
  CategoryChannel,
} from 'discord.js';
import { config } from '../config';
import { logger } from './logger';

async function resolveSnowflakeId(guild: Guild, rawIdOrUsername?: string): Promise<string | null> {
  if (!rawIdOrUsername) return null;

  const cleaned = rawIdOrUsername.replace(/[@<>!]/g, '').trim();
  if (/^\d{17,20}$/.test(cleaned)) {
    return cleaned;
  }

  try {
    const searchRes = await guild.members.search({ query: cleaned, limit: 1 });
    const found = searchRes.first();
    if (found) {
      return found.id;
    }
  } catch (err) {
    logger.warn(`Failed searching member snowflake for "${cleaned}":`, err);
  }

  return null;
}

export async function getOrCreateMatchCategory(
  guild: Guild,
  categoryName: string = '⚔️ МАТЧИ EFL'
): Promise<string> {
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
  ) as CategoryChannel | undefined;

  if (!category) {
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
      reason: 'EFL Match Channels Category',
    });
  }

  return category.id;
}

export async function createPrivateMatchChannel(
  guild: Guild,
  channelName: string,
  team1: any,
  team2: any,
  reason: string = 'Private match channel',
  categoryName: string = '⚔️ МАТЧИ EFL'
): Promise<TextChannel> {
  const permissionOverwrites: OverwriteResolvable[] = [
    // 1. Hide channel from @everyone
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  // 2. Allow Bot itself
  const botId = guild.members.me?.id || guild.client.user?.id;
  if (botId) {
    permissionOverwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  // Helper to safely add verified role/user ID
  const addTargetIfValid = async (targetId?: string | null) => {
    if (!targetId || !/^\d{17,20}$/.test(targetId)) return;

    if (guild.roles.cache.has(targetId)) {
      permissionOverwrites.push({
        id: targetId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
      return;
    }

    try {
      const member = await guild.members.fetch(targetId).catch(() => null);
      if (member) {
        permissionOverwrites.push({
          id: targetId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    } catch (_) {}
  };

  // 3. Allow Match Admin Role
  await addTargetIfValid(config.MATCH_ADMIN_ROLE_ID);

  // 4. Allow Super Admin Role if distinct
  if (config.SUPER_ADMIN_ROLE_ID !== config.MATCH_ADMIN_ROLE_ID) {
    await addTargetIfValid(config.SUPER_ADMIN_ROLE_ID);
  }

  // 5. Allow Team 1 Captain
  const cap1 = team1.members?.find((m: any) => m.role === 'CAPTAIN');
  const cap1Id = await resolveSnowflakeId(guild, cap1?.discordId || cap1?.username);
  await addTargetIfValid(cap1Id);

  // 6. Allow Team 2 Captain
  const cap2 = team2.members?.find((m: any) => m.role === 'CAPTAIN');
  const cap2Id = await resolveSnowflakeId(guild, cap2?.discordId || cap2?.username);
  await addTargetIfValid(cap2Id);

  // 7. Get or Create Category
  const parentId = await getOrCreateMatchCategory(guild, categoryName);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites,
    reason,
  });

  return channel;
}
