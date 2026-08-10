import { ModalSubmitInteraction, TextChannel } from 'discord.js';
import { MatchService } from '../../services/matchService';
import { createAdminHelpTicketEmbed } from '../../utils/embeds';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export async function handleAdminHelpModal(interaction: ModalSubmitInteraction) {
  // Custom ID format: admin_help_modal:<matchId>
  const matchId = interaction.customId.split(':')[1];
  const reason = interaction.fields.getTextInputValue('help_reason') || 'Причина не указана';

  await interaction.deferReply({ ephemeral: true });

  const match = await MatchService.getMatchById(matchId);
  if (!match) {
    return interaction.editReply({ content: '❌ Ошибка: Матч не найден.' });
  }

  const team1Name = match.team1.name;
  const team2Name = match.team2.name;
  const channelId = interaction.channelId || '';
  const guildId = interaction.guildId || '';

  // 1. Send help ticket embed to MATCH_ADMIN_CHANNEL_ID
  try {
    const adminChannel = await interaction.client.channels.fetch(config.MATCH_ADMIN_CHANNEL_ID).catch(() => null);
    if (adminChannel && adminChannel.isTextBased()) {
      const ticketEmbed = createAdminHelpTicketEmbed(
        matchId,
        team1Name,
        team2Name,
        channelId,
        guildId,
        interaction.user.id,
        reason
      );

      const adminRoleMention = config.MATCH_ADMIN_ROLE_ID && /^\d{17,20}$/.test(config.MATCH_ADMIN_ROLE_ID)
        ? `<@&${config.MATCH_ADMIN_ROLE_ID}>`
        : '';

      await (adminChannel as TextChannel).send({
        content: `🚨 **СРОЧНЫЙ ВЫЗОВ В МАТЧ** ${adminRoleMention}`,
        embeds: [ticketEmbed],
      });
    } else {
      logger.error(`Admin channel ${config.MATCH_ADMIN_CHANNEL_ID} not found for help ticket.`);
    }
  } catch (adminErr) {
    logger.error('Failed to post help ticket to admin channel:', adminErr);
  }

  // 2. Post notification message in current match channel
  try {
    if (interaction.channel && interaction.channel.isTextBased() && 'send' in interaction.channel) {
      await (interaction.channel as TextChannel).send({
        content:
          `🚨 <@${interaction.user.id}> **вызвал администратора турнира в этот матч!**\n` +
          `**Причина:** ${reason}\n\n` +
          `*Администрация уведомлена и скоро подключается к каналу.*`,
      });
    }
  } catch (chanErr) {
    logger.error('Failed to post notification in match channel:', chanErr);
  }

  return interaction.editReply({
    content: '🟢 **Вызов отправлен!** Администраторы турнира получили уведомление и скоро подключатся в этот канал.',
  });
}
