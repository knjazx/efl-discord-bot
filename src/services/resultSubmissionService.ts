import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export interface CreateSubmissionInput {
  matchId: string;
  submittedBy: string;
  sourceChannelId: string;
  winnerTeamId: string;
  scoreTeam1: number;
  scoreTeam2: number;
  mapLinks: string[];
}

export class ResultSubmissionService {
  public static async getSubmissionById(submissionId: string) {
    return prisma.matchResultSubmission.findUnique({
      where: { id: submissionId },
      include: {
        match: {
          include: {
            tournament: true,
            stage: true,
            group: true,
            team1: true,
            team2: true,
          },
        },
        mapLinks: { orderBy: { mapNumber: 'asc' } },
      },
    });
  }

  public static async getPendingSubmissionForMatch(matchId: string) {
    return prisma.matchResultSubmission.findFirst({
      where: {
        matchId,
        status: 'PENDING',
      },
    });
  }

  public static async createSubmission(input: CreateSubmissionInput) {
    const { matchId, submittedBy, sourceChannelId, winnerTeamId, scoreTeam1, scoreTeam2, mapLinks } = input;

    // Check match current state
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error('Матч не найден.');
    if (match.status === 'FINISHED') throw new Error('Этот матч уже завершён и результаты подтверждены.');

    const activeSubmission = await this.getPendingSubmissionForMatch(matchId);
    if (activeSubmission) {
      throw new Error('Результат этого матча уже отправлен и ожидает проверки администрацией.');
    }

    logger.info(`Creating match result submission for match ${matchId} by user ${submittedBy}`);

    // Create user record if not exists
    await prisma.user.upsert({
      where: { discordId: submittedBy },
      update: {},
      create: {
        discordId: submittedBy,
        username: `DiscordUser_${submittedBy.slice(-4)}`,
      },
    });

    return prisma.$transaction(async (tx) => {
      const submission = await tx.matchResultSubmission.create({
        data: {
          matchId,
          submittedBy,
          sourceChannelId,
          winnerTeamId,
          scoreTeam1,
          scoreTeam2,
          status: 'PENDING',
          mapLinks: {
            create: mapLinks.map((url, index) => ({
              mapNumber: index + 1,
              url,
            })),
          },
        },
        include: {
          match: {
            include: {
              tournament: true,
              stage: true,
              group: true,
              team1: true,
              team2: true,
            },
          },
          mapLinks: true,
        },
      });

      // Update match status to PENDING_APPROVAL
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'PENDING_APPROVAL' },
      });

      return submission;
    });
  }

  public static async approveSubmission(submissionId: string, adminDiscordId: string) {
    logger.info(`Attempting atomic approval for submission ${submissionId} by admin ${adminDiscordId}`);

    // Create admin user record if not exists
    await prisma.user.upsert({
      where: { discordId: adminDiscordId },
      update: {},
      create: {
        discordId: adminDiscordId,
        username: `Admin_${adminDiscordId.slice(-4)}`,
        role: 'ADMIN',
      },
    });

    return prisma.$transaction(async (tx) => {
      // Atomic status update: update status to APPROVED ONLY IF current status is PENDING
      const updateResult = await tx.matchResultSubmission.updateMany({
        where: {
          id: submissionId,
          status: 'PENDING',
        },
        data: {
          status: 'APPROVED',
          reviewedBy: adminDiscordId,
          reviewedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        return { success: false, reason: 'ALREADY_PROCESSED' };
      }

      // Fetch the updated submission details
      const submission = await tx.matchResultSubmission.findUnique({
        where: { id: submissionId },
        include: {
          match: {
            include: { team1: true, team2: true, group: true },
          },
          mapLinks: true,
        },
      });

      if (!submission) throw new Error('Submission lost during approval transaction');

      const { matchId, winnerTeamId, scoreTeam1, scoreTeam2 } = submission;
      const match = submission.match;

      // Update Match to FINISHED
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'FINISHED',
          winnerTeamId,
          scoreTeam1,
          scoreTeam2,
          finishedAt: new Date(),
        },
      });

      // Update team statistics
      const loserTeamId = winnerTeamId === match.team1Id ? match.team2Id : match.team1Id;

      await tx.team.update({
        where: { id: winnerTeamId },
        data: {
          wins: { increment: 1 },
          points: { increment: 3 },
          matchesPlayed: { increment: 1 },
        },
      });

      await tx.team.update({
        where: { id: loserTeamId },
        data: {
          losses: { increment: 1 },
          matchesPlayed: { increment: 1 },
        },
      });

      return { success: true, submission };
    });
  }

  public static async rejectSubmission(submissionId: string, adminDiscordId: string, reason: string) {
    logger.info(`Attempting atomic rejection for submission ${submissionId} by admin ${adminDiscordId}`);

    // Create admin user record if not exists
    await prisma.user.upsert({
      where: { discordId: adminDiscordId },
      update: {},
      create: {
        discordId: adminDiscordId,
        username: `Admin_${adminDiscordId.slice(-4)}`,
        role: 'ADMIN',
      },
    });

    return prisma.$transaction(async (tx) => {
      // Atomic status update: update status to REJECTED ONLY IF current status is PENDING
      const updateResult = await tx.matchResultSubmission.updateMany({
        where: {
          id: submissionId,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          reviewedBy: adminDiscordId,
          reviewedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        return { success: false, reason: 'ALREADY_PROCESSED' };
      }

      // Fetch the updated submission details
      const submission = await tx.matchResultSubmission.findUnique({
        where: { id: submissionId },
        include: {
          match: {
            include: { team1: true, team2: true },
          },
        },
      });

      if (!submission) throw new Error('Submission lost during rejection transaction');

      // Re-open match for submission
      await tx.match.update({
        where: { id: submission.matchId },
        data: { status: 'SCHEDULED' },
      });

      return { success: true, submission };
    });
  }
}
