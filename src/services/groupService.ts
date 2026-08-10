import { prisma } from '../database/prisma';
import { TournamentService } from './tournamentService';
import { logger } from '../utils/logger';

export class GroupService {
  public static async syncTeamStats() {
    const teams = await prisma.team.findMany();
    for (const t of teams) {
      const wonMatches = await prisma.match.count({
        where: { status: 'FINISHED', winnerTeamId: t.id },
      });
      const lostMatches = await prisma.match.count({
        where: {
          status: 'FINISHED',
          OR: [{ team1Id: t.id }, { team2Id: t.id }],
          NOT: { winnerTeamId: t.id },
        },
      });
      const totalPlayed = wonMatches + lostMatches;
      const points = wonMatches * 3;

      await prisma.team.update({
        where: { id: t.id },
        data: {
          wins: wonMatches,
          losses: lostMatches,
          points: points,
          matchesPlayed: totalPlayed,
        },
      });
    }
  }

  public static async generateGroups(
    groupCount: number,
    teamsPerGroup: number,
    randomize: boolean = true
  ) {
    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];

    let teams = await prisma.team.findMany({
      include: { members: true },
      orderBy: { createdAt: 'asc' },
    });

    if (teams.length === 0) {
      throw new Error('В базе данных нет зарегистрированных команд. Сначала добавьте команды через /team bulk-add.');
    }

    if (randomize) {
      teams = [...teams].sort(() => Math.random() - 0.5);
    }

    const maxCapacity = groupCount * teamsPerGroup;
    const selectedTeams = teams.slice(0, maxCapacity);

    logger.info(`Generating ${groupCount} groups for stage ${stage.id} with ${selectedTeams.length} teams...`);

    return prisma.$transaction(async (tx) => {
      // Clear existing matches and groups for this stage
      await tx.match.deleteMany({
        where: { stageId: stage.id },
      });

      await tx.group.deleteMany({
        where: { stageId: stage.id },
      });

      // Reset stats for all teams to 0
      await tx.team.updateMany({
        data: {
          wins: 0,
          losses: 0,
          points: 0,
          matchesPlayed: 0,
        },
      });

      const generatedGroups: any[] = [];
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      for (let i = 0; i < groupCount; i++) {
        const groupLetter = alphabet[i] || `${i + 1}`;
        const groupName = `Group ${groupLetter}`;

        const groupTeamsChunk = selectedTeams.slice(i * teamsPerGroup, (i + 1) * teamsPerGroup);

        const group = await tx.group.create({
          data: {
            stageId: stage.id,
            name: groupName,
            teams: {
              create: groupTeamsChunk.map(t => ({
                teamId: t.id,
              })),
            },
          },
          include: {
            teams: {
              include: {
                team: {
                  include: { members: true },
                },
              },
            },
          },
        });

        generatedGroups.push(group);
      }

      return {
        groups: generatedGroups,
        totalAssignedTeams: selectedTeams.length,
        unassignedCount: Math.max(0, teams.length - selectedTeams.length),
      };
    });
  }

  public static async getGroupsWithTeams() {
    // Synchronize team wins/losses/points dynamically from finished matches
    await this.syncTeamStats();

    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];

    const groups = await prisma.group.findMany({
      where: { stageId: stage.id },
      include: {
        teams: {
          include: {
            team: {
              include: { members: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Sort teams inside each group by standings: points desc, wins desc, losses asc
    for (const grp of groups) {
      grp.teams.sort((a, b) => {
        if (b.team.points !== a.team.points) return b.team.points - a.team.points;
        if (b.team.wins !== a.team.wins) return b.team.wins - a.team.wins;
        return a.team.losses - b.team.losses;
      });
    }

    return groups;
  }

  public static async clearAllGroups() {
    const tournament = await TournamentService.getOrCreateDefaultTournament();
    const stage = tournament.stages[0];

    const result = await prisma.group.deleteMany({
      where: { stageId: stage.id },
    });

    // Reset team stats to 0
    await prisma.team.updateMany({
      data: {
        wins: 0,
        losses: 0,
        points: 0,
        matchesPlayed: 0,
      },
    });

    return result.count;
  }
}
