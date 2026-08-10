import { Guild } from 'discord.js';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export class TeamService {
  public static async createTeamWithCaptain(
    name: string,
    tag: string,
    captainDiscordId: string,
    captainUsername?: string
  ) {
    logger.info(`Creating team ${name} [${tag}] with captain Discord ID: ${captainDiscordId}`);

    return prisma.$transaction(async (tx) => {
      // Upsert Team
      const team = await tx.team.upsert({
        where: { tag },
        update: { name },
        create: {
          name,
          tag,
        },
      });

      // Upsert Captain User
      const captain = await tx.user.upsert({
        where: { discordId: captainDiscordId },
        update: {
          teamId: team.id,
          role: 'CAPTAIN',
          username: captainUsername || `Captain_${captainDiscordId.slice(-4)}`,
        },
        create: {
          discordId: captainDiscordId,
          username: captainUsername || `Captain_${captainDiscordId.slice(-4)}`,
          teamId: team.id,
          role: 'CAPTAIN',
        },
      });

      return { team, captain };
    });
  }

  public static async bulkAddTeams(lines: string[], guild: Guild | null = null) {
    const results: { line: string; success: boolean; message: string }[] = [];

    // Pre-fetch existing teams to avoid database query overhead in loop
    const existingTeams = await prisma.team.findMany();
    const usedTags = new Set(existingTeams.map(t => t.tag));

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Expected format: "Team Name - @CaptainUsername" or "Team Name [TAG] - DiscordID"
      const parts = line.split('-').map(p => p.trim());
      if (parts.length < 2) {
        results.push({ line, success: false, message: 'Неверный формат. Ожидается: НазваниеКоманды - @Капитан' });
        continue;
      }

      const teamString = parts[0];
      const captainRawStr = parts[1];

      // Resolve Captain Discord ID
      let captainDiscordId: string | null = null;
      let captainUsername: string | undefined = undefined;

      // Case 1: Pure numeric ID or mention <@123456789>
      const cleanNumericId = captainRawStr.replace(/[<@!>]/g, '').trim();
      if (/^\d{17,20}$/.test(cleanNumericId)) {
        captainDiscordId = cleanNumericId;
      } else if (guild) {
        // Case 2: Resolve by username / handle via REST search (fast, non-blocking)
        const searchName = captainRawStr.replace(/^@/, '').trim();

        // 2a. Check cache first
        const cachedMember = guild.members.cache.find(m => {
          const uName = m.user.username.toLowerCase();
          const gName = m.user.globalName?.toLowerCase();
          const dName = m.displayName.toLowerCase();
          const target = searchName.toLowerCase();
          return uName === target || gName === target || dName === target;
        });

        if (cachedMember) {
          captainDiscordId = cachedMember.id;
          captainUsername = cachedMember.user.username;
        } else {
          // 2b. Use REST search API (returns in ms, does not hang)
          try {
            const searchedMembers = await guild.members.search({ query: searchName, limit: 1 });
            const foundMember = searchedMembers.first();
            if (foundMember) {
              captainDiscordId = foundMember.id;
              captainUsername = foundMember.user.username;
            }
          } catch (searchErr) {
            logger.warn(`Failed REST member search for "${searchName}":`, searchErr);
          }
        }
      }

      if (!captainDiscordId) {
        const cleanName = captainRawStr.replace(/^@/, '').trim();
        results.push({
          line,
          success: false,
          message: `Пользователь **"${cleanName}"** не найден на сервере Discord. Укажите числовой Discord ID.`,
        });
        continue;
      }

      // Extract tag if present: e.g. "NPC Esports [NPC]" or generate smart tag
      let name = teamString;
      let tag = '';

      const tagMatch = teamString.match(/\[(.*?)\]/);
      if (tagMatch) {
        tag = tagMatch[1].trim().toUpperCase();
        name = teamString.replace(/\[.*?\]/, '').trim();
      } else {
        tag = this.generateSmartTag(teamString);
      }

      // Ensure unique tag
      let finalTag = tag;
      let counter = 1;
      while (usedTags.has(finalTag)) {
        finalTag = `${tag.slice(0, 3)}${counter++}`;
      }
      usedTags.add(finalTag);

      try {
        const { team, captain } = await this.createTeamWithCaptain(name, finalTag, captainDiscordId, captainUsername);
        results.push({
          line,
          success: true,
          message: `Команда **${team.name}** [${team.tag}] ➔ Капитан: <@${captain.discordId}>`,
        });
      } catch (err: any) {
        results.push({ line, success: false, message: `Ошибка записи в БД: ${err.message || err}` });
      }
    }

    return results;
  }

  private static generateSmartTag(teamName: string): string {
    const words = teamName.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const acronym = words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (acronym.length >= 2) return acronym.slice(0, 5);
    }
    const clean = teamName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return clean.slice(0, 4) || 'TEAM';
  }

  public static async deleteTeamByTagOrName(query: string) {
    const cleanQuery = query.trim();

    const team = await prisma.team.findFirst({
      where: {
        OR: [
          { tag: { equals: cleanQuery } },
          { name: { equals: cleanQuery } },
          { tag: { equals: cleanQuery.toUpperCase() } },
        ],
      },
    });

    if (!team) {
      return { success: false, message: `Команда "${cleanQuery}" не найдена.` };
    }

    await prisma.team.delete({
      where: { id: team.id },
    });

    logger.info(`Deleted team ${team.name} [${team.tag}] (ID: ${team.id})`);
    return { success: true, team };
  }

  public static async deleteAllTeams() {
    const count = await prisma.team.count();
    await prisma.team.deleteMany({});
    logger.info(`Deleted all ${count} teams from database.`);
    return count;
  }

  public static async getAllTeams() {
    return prisma.team.findMany({
      include: { members: true },
      orderBy: { points: 'desc' },
    });
  }
}
