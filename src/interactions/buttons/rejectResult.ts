import {
  ButtonInteraction,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { PermissionService } from '../../services/permissionService';

export async function handleRejectResultButton(interaction: ButtonInteraction) {
  // Custom ID format: reject_result:<submissionId>
  const submissionId = interaction.customId.split(':')[1];

  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора матчей для этого действия.',
      ephemeral: true,
    });
  }

  // Open Modal for Rejection Reason
  const modal = new ModalBuilder()
    .setCustomId(`reject_reason_modal:${submissionId}`)
    .setTitle('Reject Match Result');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reject_reason_input')
    .setLabel('Reason for rejection')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Например: Ссылка на матч №2 не соответствует требованиям.')
    .setRequired(true)
    .setMinLength(5);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

  return interaction.showModal(modal);
}
