import { ButtonInteraction, GuildMember, TextChannel } from 'discord.js';
import { PermissionService } from '../../services/permissionService';
import { ResultSubmissionService } from '../../services/resultSubmissionService';
import {
  createAdminApprovedEmbed,
  createAdminActionRow,
  createPlayerApprovedNotificationEmbed,
} from '../../utils/embeds';
import { logger } from '../../utils/logger';

export async function handleApproveResultButton(interaction: ButtonInteraction) {
  // Custom ID format: approve_result:<submissionId>
  const submissionId = interaction.customId.split(':')[1];

  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора матчей для этого действия.',
      ephemeral: true,
    });
  }

  try {
    const result = await ResultSubmissionService.approveSubmission(submissionId, interaction.user.id);

    if (!result.success || !result.submission) {
      return interaction.reply({
        content: '⚠️ Эта заявка уже была обработана другим администратором или отменена.',
        ephemeral: true,
      });
    }

    const { submission } = result;
    const match = submission.match;

    // Update Admin Message embed & disable buttons
    if (interaction.message.embeds[0]) {
      const updatedEmbed = createAdminApprovedEmbed(
        interaction.message.embeds[0],
        interaction.user.id,
        new Date()
      );
      const disabledRow = createAdminActionRow(submissionId, true);

      await interaction.update({
        embeds: [updatedEmbed],
        components: [disabledRow],
      });
    } else {
      await interaction.reply({ content: '🟢 Заявка успешно одобрена.', ephemeral: true });
    }

    // Notify player match channel (sourceChannelId)
    try {
      const sourceChannel = await interaction.client.channels.fetch(submission.sourceChannelId).catch(() => null);
      if (sourceChannel && sourceChannel.isTextBased()) {
        const playerNotificationEmbed = createPlayerApprovedNotificationEmbed(
          match.team1.name,
          match.team2.name,
          submission.scoreTeam1,
          submission.scoreTeam2,
          interaction.user.id
        );

        await (sourceChannel as TextChannel).send({
          embeds: [playerNotificationEmbed],
        });
      }
    } catch (chanErr) {
      logger.error(`Failed to send approval notification to source channel ${submission.sourceChannelId}:`, chanErr);
    }

    // 1. Publish official match result embed to Results Channel
    try {
      const { AutoUpdateService } = await import('../../services/autoUpdateService');
      const resultsChanId = (await AutoUpdateService.getResultsChannelId()) || process.env.MATCH_RESULTS_CHANNEL_ID;
      logger.info(`Publishing approved result. Resolved results channel ID: "${resultsChanId}"`);

      if (resultsChanId) {
        const resultsChannel = await interaction.client.channels.fetch(resultsChanId).catch((fetchErr) => {
          logger.error(`Error fetching results channel ${resultsChanId}:`, fetchErr);
          return null;
        });

        if (resultsChannel && resultsChannel.isTextBased()) {
          const winnerTeamName = submission.winnerTeamId === match.team1Id ? match.team1.name : match.team2.name;
          const subAny = submission as any;
          const mapUrls: string[] = subAny.mapLinks ? subAny.mapLinks.map((m: any) => m.url) : [];
          const groupName: string | undefined = subAny.match?.group?.name;

          const { createOfficialMatchResultEmbed } = await import('../../utils/embeds');
          const resultEmbed = createOfficialMatchResultEmbed(
            match.team1.name,
            match.team2.name,
            winnerTeamName,
            submission.scoreTeam1,
            submission.scoreTeam2,
            match.format,
            groupName,
            mapUrls
          );

          await (resultsChannel as TextChannel).send({ embeds: [resultEmbed] });
          logger.info(`Successfully posted match result embed to channel ${resultsChanId}`);
        } else {
          logger.warn(`Results channel ${resultsChanId} is not text based or not found.`);
        }
      } else {
        logger.warn('No results channel configured. Use /match set-results-channel channel:#channel to set one.');
      }
    } catch (resErr) {
      logger.error('Failed publishing match result to results channel:', resErr);
    }

    // 2. Auto-update standings graphic image
    try {
      const { AutoUpdateService } = await import('../../services/autoUpdateService');
      await AutoUpdateService.publishStandingsImage(interaction.client);
    } catch (autoErr) {
      logger.error('Failed auto-updating standings image after approval:', autoErr);
    }
  } catch (error: any) {
    logger.error('Error during result approval:', error);
    return interaction.reply({
      content: `❌ **Ошибка при одобрении заявки:** ${error.message || error}`,
      ephemeral: true,
    });
  }
}
