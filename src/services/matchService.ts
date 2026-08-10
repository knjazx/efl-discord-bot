import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

function sanitizeChannelName(name: string): string {
  let cleaned = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!cleaned) cleaned = 'team';
  return cleaned;
}

export class MatchService {
  public static async getMatchById(matchId: string) {
    return prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
        submissions: {
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
  }

  public static async getMatchByChannelId(channelId: string) {
    return prisma.match.findUnique({
      where: { channelId },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: { include: { members: true } },
        team2: { include: { members: true } },
        submissions: {
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
  }

  public static async getAvailableMatchesForUser(discordId: string) {
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { team: true },
    });

    const userTeamId = user?.teamId;

    return prisma.match.findMany({
      where: {
        status: { in: ['SCHEDULED', 'PENDING_APPROVAL'] },
        OR: userTeamId
          ? [{ team1Id: userTeamId }, { team2Id: userTeamId }]
          : undefined,
      },
      include: {
        tournament: true,
        stage: true,
        group: true,
        team1: true,
        team2: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

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
    logger.info(`Creating match (Round ${data.round || 1}) between team ${data.team1Id} and ${data.team2Id} (${data.format})`);
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

  public static async generateRoundRobinMatches(
    format: string = 'BO1',
    createDiscordChannels: boolean = false,
    guild?: any,
    targetRound?: number
  ) {
    const { TournamentService } = await import('./tournamentService');
    const { GroupService } = await import('./groupService');
    const { createMatchCardEmbed } = await import('../utils/embeds');

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
      const teams = grp.teams.map(gt => gt.team);
      if (teams.length < 2) continue;

      let roundPairs: { t1: any; t2: any; round: number }[] = [];

      if (teams.length === 4) {
        roundPairs.push({ t1: teams[0], t2: teams[1], round: 1 });
        roundPairs.push({ t1: teams[2], t2: teams[3], round: 1 });

        roundPairs.push({ t1: teams[0], t2: teams[2], round: 2 });
        roundPairs.push({ t1: teams[1], t2: teams[3], round: 2 });

        roundPairs.push({ t1: teams[0], t2: teams[3], round: 3 });
        roundPairs.push({ t1: teams[1], t2: teams[2], round: 3 });
      } else {
        let rCounter = 1;
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            roundPairs.push({ t1: teams[i], t2: teams[j], round: rCounter });
            rCounter = (rCounter % 3) + 1;
          }
        }
      }

      if (targetRound) {
        roundPairs = roundPairs.filter(p => p.round === targetRound);
      }

      for (const pair of roundPairs) {
        const team1 = pair.t1;
        const team2 = pair.t2;
        const roundNum = pair.round;

        let channelId: string | undefined = undefined;

        if (createDiscordChannels && guild) {
          try {
            const rawName = `r${roundNum}-${team1.tag}-vs-${team2.tag}`;
            const channelName = sanitizeChannelName(rawName);
            const { createPrivateMatchChannel } = await import('../utils/privateChannel');
            const channel = await createPrivateMatchChannel(
              guild,
              channelName,
              team1,
              team2,
              `Round ${roundNum} match for ${grp.name}`
            );
            channelId = channel.id;

            const { embed, row } = createMatchCardEmbed(
              'pending',
              team1.name,
              team2.name,
              format,
              tournament.name,
              stage.name,
              grp.name
            );
            await channel.send({ embeds: [embed], components: [row] });
          } catch (chanErr) {
            logger.warn(`Failed to create channel for ${team1.tag} vs ${team2.tag}:`, chanErr);
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
