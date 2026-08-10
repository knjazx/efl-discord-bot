import { Client, AttachmentBuilder, TextChannel } from 'discord.js';
import { GroupService } from './groupService';
import { generateGroupsImageBuffer } from '../utils/imageGenerator';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';

export class AutoUpdateService {
  private static targetChannelId: string | null = null;
  private static resultsChannelId: string | null = null;
  private static cronTimer: NodeJS.Timeout | null = null;

  public static async setTargetChannel(channelId: string) {
    this.targetChannelId = channelId;
    const resultsId = await this.getResultsChannelId();
    const combined = `${channelId}:${resultsId || ''}`;

    await prisma.tournament.updateMany({
      data: { season: combined },
    });
    logger.info(`Auto-update standings channel persisted as: ${channelId}`);
  }

  public static async getTargetChannelId(): Promise<string | null> {
    if (this.targetChannelId && /^\d{17,20}$/.test(this.targetChannelId)) return this.targetChannelId;
    const tourney = await prisma.tournament.findFirst({ where: { name: 'EFL Season 1' } });
    if (tourney && tourney.season) {
      const parts = tourney.season.split(':');
      if (parts[0] && /^\d{17,20}$/.test(parts[0])) {
        this.targetChannelId = parts[0];
      }
    }
    return this.targetChannelId;
  }

  public static async setResultsChannel(channelId: string) {
    this.resultsChannelId = channelId;
    const standingsId = await this.getTargetChannelId();
    const combined = `${standingsId || ''}:${channelId}`;

    await prisma.tournament.updateMany({
      data: { season: combined },
    });
    logger.info(`Match results feed channel persisted as: ${channelId}`);
  }

  public static async getResultsChannelId(): Promise<string | null> {
    if (this.resultsChannelId && /^\d{17,20}$/.test(this.resultsChannelId)) return this.resultsChannelId;
    const tourney = await prisma.tournament.findFirst({ where: { name: 'EFL Season 1' } });
    if (tourney && tourney.season) {
      const parts = tourney.season.split(':');
      if (parts[1] && /^\d{17,20}$/.test(parts[1])) {
        this.resultsChannelId = parts[1];
      }
    }
    return this.resultsChannelId;
  }

  public static async publishStandingsImage(client: Client, channelIdOverride?: string) {
    const channelId = channelIdOverride || (await this.getTargetChannelId());
    if (!channelId) {
      logger.info('No auto-update standings channel configured. Use /group set-channel to enable.');
      return false;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        logger.error(`Channel ${channelId} not found or not text-based.`);
        return false;
      }

      const groups = await GroupService.getGroupsWithTeams();
      if (groups.length === 0) return false;

      const imageData = groups.map(g => ({
        name: g.name,
        teams: g.teams.map((gt: any) => {
          const captain = gt.team.members.find((m: any) => m.role === 'CAPTAIN');
          return {
            name: gt.team.name,
            tag: gt.team.tag,
            wins: gt.team.wins,
            losses: gt.team.losses,
            points: gt.team.points,
            matchesPlayed: gt.team.matchesPlayed,
            captainUsername: captain?.username,
          };
        }),
      }));

      const imageBuffer = await generateGroupsImageBuffer(imageData);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'efl-standings-grid.png' });

      await (channel as TextChannel).send({
        content: `📊 **ОФИЦИАЛЬНОЕ ОБНОВЛЕНИЕ ТУРНИРНОЙ ТАБЛИЦЫ EFL** • <t:${Math.floor(Date.now() / 1000)}:f>`,
        files: [attachment],
      });

      logger.info(`Successfully published standings image update to channel ${channelId}`);
      return true;
    } catch (err) {
      logger.error('Failed to publish automated standings image:', err);
      return false;
    }
  }

  public static startDailyCron(client: Client) {
    if (this.cronTimer) clearInterval(this.cronTimer);

    logger.info('Starting daily 00:00 standings auto-updater cron scheduler...');

    this.cronTimer = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        logger.info('Midnight 00:00 triggered! Publishing automated daily standings update...');
        await this.publishStandingsImage(client);
      }
    }, 60000);
  }
}
