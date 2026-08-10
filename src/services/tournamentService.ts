import { prisma } from '../database/prisma';

export class TournamentService {
  public static async getOrCreateDefaultTournament() {
    let tournament = await prisma.tournament.findFirst({
      where: { name: 'EFL Season 1' },
      include: {
        stages: {
          include: {
            groups: true,
          },
        },
      },
    });

    if (!tournament) {
      tournament = await prisma.tournament.create({
        data: {
          name: 'EFL Season 1',
          season: 'Season 1',
          status: 'ACTIVE',
          stages: {
            create: [
              {
                name: 'Group Stage',
                order: 1,
                groups: {
                  create: [{ name: 'Group A' }, { name: 'Group B' }],
                },
              },
            ],
          },
        },
        include: {
          stages: {
            include: {
              groups: true,
            },
          },
        },
      });
    }

    return tournament;
  }

  public static async getOrCreateTeam(name: string, tag: string) {
    let team = await prisma.team.findUnique({ where: { tag } });

    if (!team) {
      team = await prisma.team.create({
        data: { name, tag },
      });
    }

    return team;
  }
}
