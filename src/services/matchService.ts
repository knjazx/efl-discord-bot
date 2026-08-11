import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export function sanitizeChannelName(name: string): string {
  let clean = name.toLowerCase();
  clean = clean.replace(/[^a-z0-9-_]/g, '-');
  clean = clean.replace(/-+/g, '-');
  clean = clean.replace(/^-|-$/g, '');
  if (!clean) clean = 'match-channel';
  return clean.slice(0, 95);
}

export function generateRoundRobinPairs(teams: any[]): { t1: any; t2: any; round: number }[] {
  if (teams.length < 2) return [];

  // Optimized canonical schedule for standard 4-team CS2 group stage
  if (teams.length === 4) {
    return [
      // Round 1 (Day 1)
      { t1: teams[0], t2: teams[1], round: 1 },
      { t1: teams[2], t2: teams[3], round: 1 },

      // Round 2 (Day 2)
      { t1: teams[0], t2: teams[2], round: 2 },
      { t1: teams[1], t2: teams[3], round: 2 },

      // Round 3 (Day 3)
      { t1: teams[0], t2: teams[3], round: 3 },
      { t1: teams[1], t2: teams[2], round: 3 },
    ];
  }

  // General Berger / Circle algorithm for arbitrary team counts (5, 6, 8, etc.)
  const list: (any | null)[] = [...teams];
  if (list.length % 2 !== 0) {
    list.push(null); // Dummy team for odd team count
  }

  const numTeams = list.length;
  const numRounds = numTeams - 1;
  const half = numTeams / 2;
  const pairs: { t1: any; t2: any; round: number }[] = [];

  for (let r = 0; r < numRounds; r++) {
    for (let i = 0; i < half; i++) {
      const t1 = list[i];
      const t2 = list[numTeams - 1 - i];

      if (t1 && t2) {
        pairs.push({
          t1,
          t2,
          round: r + 1,
        });
      }
    }

    // Rotate teams array for next round: keep list[0] fixed, move list[numTeams - 1] to index 1
    list.splice(1, 0, list.pop()!);
  }

  return pairs;
}

export class MatchService {
  public static async createMatch(data: {
    tournamentId: string;
    stageId: string;
    groupId?: string;
    channelId?: string;
    team1Id: string;
    team2Id: string;
    format: string;
    round?: number;
  }) {
    return prisma.match.create({
      data: {
        tournamentId: data.tournamentId,
        stageId: data.stageId,
        groupId: data.groupId,
        channelId: data.channelId,
        team1Id: data.team1Id,
        team2Id: data.team2Id,
        format: data.format,
        round: data.round || 1,
        status: 'SCHEDULED',
      },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: true,
        team2: true,
      },
    });
  }

  public static async getMatchById(matchId: string) {
    return prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
      },
    });
  }

  public static async getMatchByChannelId(channelId: string) {
    return prisma.match.findFirst({
      where: { channelId },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
      },
    });
  }

  public static async getAvailableMatchesForUser(discordUserId: string, isMatchAdmin: boolean = false) {
    const { TournamentService } = await import('./tournamentService');
    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];

    const scheduledMatches = await prisma.match.findMany({
      where: {
        stageId: stage.id,
        status: 'SCHEDULED',
      },
      include: {
        group: true,
        stage: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (isMatchAdmin) {
      return scheduledMatches;
    }

    const filtered = scheduledMatches.filter(m => {
      const isTeam1Member = m.team1.members.some(mem => mem.discordId === discordUserId);
      const isTeam2Member = m.team2.members.some(mem => mem.discordId === discordUserId);
      return isTeam1Member || isTeam2Member;
    });

    // Fallback if not linked directly to user ID: return all scheduled matches
    if (filtered.length === 0 && scheduledMatches.length > 0) {
      return scheduledMatches;
    }

    return filtered;
  }

  public static async generateRoundRobinMatches(
    format: string = 'BO1',
    createDiscordChannels: boolean = false,
    guild?: any,
    targetRound?: number
  ) {
    const { TournamentService } = await import('./tournamentService');
    const { GroupService } = await import('./groupService');

    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];
    const groups = await GroupService.getGroupsWithTeams();

    if (groups.length === 0) {
      throw new Error('Группы ещё не созданы. Сначала сформируйте их через /group generate.');
    }

    if (targetRound) {
      await prisma.match.deleteMany({
        where: { stageId: stage.id, round: targetRound },
      });
    } else {
      await prisma.match.deleteMany({
        where: { stageId: stage.id },
      });
    }

    const createdMatches: any[] = [];

    for (const grp of groups) {
      // Sort teams deterministically by name to ensure stable indices across all round generations
      const teams = grp.teams
        .map(gt => gt.team)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

      if (teams.length < 2) continue;

      let roundPairs = generateRoundRobinPairs(teams);

      if (targetRound) {
        roundPairs = roundPairs.filter(rp => rp.round === targetRound);
      }

      for (const pair of roundPairs) {
        const { t1: team1, t2: team2, round: roundNum } = pair;

        logger.info(`Creating match (Round ${roundNum}) between team ${team1.id} and ${team2.id} (${format})`);

        let channelId: string | undefined = undefined;

        if (createDiscordChannels && guild) {
          const rawName = `r${roundNum}-${team1.tag}-vs-${team2.tag}`;
          const channelName = sanitizeChannelName(rawName);
          const categoryName = `⚔️ МАТЧИ — ДЕНЬ ${roundNum}`;
          try {
            const { createPrivateMatchChannel } = await import('../utils/privateChannel');
            const channel = await createPrivateMatchChannel(
              guild,
              channelName,
              team1,
              team2,
              `Round ${roundNum} match channel`,
              categoryName
            );
            channelId = channel.id;
          } catch (err) {
            logger.error(`Failed creating private channel for ${channelName}:`, err);
          }
        }

        const match = await this.createMatch({
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId: grp.id,
          channelId,
          team1Id: team1.id,
          team2Id: team2.id,
          format,
          round: roundNum,
        });

        createdMatches.push(match);
      }
    }

    return createdMatches;
  }

  public static async getMatchesByRound(roundNum: number) {
    const { TournamentService } = await import('./tournamentService');
    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];

    return prisma.match.findMany({
      where: {
        stageId: stage.id,
        round: roundNum,
      },
      include: {
        group: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
      },
      orderBy: { group: { name: 'asc' } },
    });
  }

  public static async openDayChannels(roundNum: number, guild: any) {
    const matches = await this.getMatchesByRound(roundNum);
    if (matches.length === 0) {
      throw new Error(`Матчи для Игрового Дня ${roundNum} не найдены. Сначала сгенерируйте их через /match generate-rr.`);
    }

    const { createPrivateMatchChannel } = await import('../utils/privateChannel');
    const { createMatchCardEmbed } = await import('../utils/embeds');

    let createdCount = 0;
    const errors: string[] = [];

    for (const match of matches) {
      if (match.channelId) {
        const existingChan = await guild.channels.fetch(match.channelId).catch(() => null);
        if (existingChan) {
          logger.info(`Channel ${match.channelId} already exists for match ${match.id}, skipping creation.`);
          continue;
        }
      }

      const rawName = `r${roundNum}-${match.team1.tag}-vs-${match.team2.tag}`;
      const channelName = sanitizeChannelName(rawName);
      const categoryName = `⚔️ МАТЧИ — ДЕНЬ ${roundNum}`;

      try {
        const channel = await createPrivateMatchChannel(
          guild,
          channelName,
          match.team1,
          match.team2,
          `Day ${roundNum} match channel`,
          categoryName
        );

        await prisma.match.update({
          where: { id: match.id },
          data: { channelId: channel.id },
        });

        const { embed, row } = createMatchCardEmbed(
          match.id,
          match.team1.name,
          match.team2.name,
          match.format,
          'EFL CS2 League',
          'Group Stage',
          match.group?.name || 'Group A'
        );

        await channel.send({ embeds: [embed], components: [row] });
        createdCount++;
      } catch (err: any) {
        logger.error(`Failed creating private channel for match ${match.id}:`, err);
        errors.push(`${match.team1.name} vs ${match.team2.name}: ${err.message || err}`);
      }
    }

    return { createdCount, total: matches.length, errors };
  }
}
