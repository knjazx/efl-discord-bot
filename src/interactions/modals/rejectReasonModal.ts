import { ModalSubmitInteraction, TextChannel } from 'discord.js';
import { ResultSubmissionService } from '../../services/resultSubmissionService';
import {
  createAdminRejectedEmbed,
  createAdminActionRow,
  createPlayerRejectedNotificationEmbed,
} from '../../utils/embeds';
import { logger } from '../../utils/logger';

export async function handleRejectReasonModal(interaction: ModalSubmitInteraction) {
  // Custom ID format: reject_reason_modal:<submissionId>
  const submissionId = interaction.customId.split(':')[1];
  const reason = interaction.fields.getTextInputValue('reject_reason_input').trim();

  if (!reason) {
    return interaction.reply({
      content: '❌ Причина отклонения обязательна.',
      ephemeral: true,
    });
  }

  try {
    const result = await ResultSubmissionService.rejectSubmission(submissionId, interaction.user.id, reason);

    if (!result.success || !result.submission) {
      return interaction.reply({
        content: '⚠️ Эта заявка уже была обработана другим администратором или отменена.',
        ephemeral: true,
      });
    }

    const { submission } = result;
    const match = submission.match;

    // Update Admin Message embed & disable buttons
    if (interaction.isFromMessage() && interaction.message.embeds[0]) {
      const updatedEmbed = createAdminRejectedEmbed(
        interaction.message.embeds[0],
        interaction.user.id,
        reason,
        new Date()
      );
      const disabledRow = createAdminActionRow(submissionId, true);

      await interaction.update({
        embeds: [updatedEmbed],
        components: [disabledRow],
      });
    } else {
      await interaction.reply({ content: '🔴 Заявка успешно отклонена.', ephemeral: true });
    }

    // Send rejection reason notification directly to player's match channel (sourceChannelId)
    try {
      const sourceChannel = await interaction.client.channels.fetch(submission.sourceChannelId);
      if (sourceChannel && sourceChannel.isTextBased()) {
        const playerNotificationEmbed = createPlayerRejectedNotificationEmbed(
          match.team1.name,
          match.team2.name,
          reason,
          interaction.user.id,
          submission.id
        );

        await (sourceChannel as TextChannel).send({
          embeds: [playerNotificationEmbed],
        });
      }
    } catch (chanErr) {
      logger.error(`Failed to send rejection notification to source channel ${submission.sourceChannelId}:`, chanErr);
    }
  } catch (error: any) {
    logger.error('Error during result rejection:', error);
    return interaction.reply({
      content: `❌ **Ошибка при отклонении заявки:** ${error.message || error}`,
      ephemeral: true,
    });
  }
}
