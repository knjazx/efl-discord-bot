import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';

export async function handleRequestAdminHelpButton(interaction: ButtonInteraction) {
  // Custom ID format: request_admin_help:<matchId>
  const matchId = interaction.customId.split(':')[1];

  const modal = new ModalBuilder()
    .setCustomId(`admin_help_modal:${matchId}`)
    .setTitle('Вызов администратора в матч');

  const reasonInput = new TextInputBuilder()
    .setCustomId('help_reason')
    .setLabel('Причина вызова (необязательно)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Например: соперники не зашли на сервер, задержка по времени, нужен сервер...')
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

  return interaction.showModal(modal);
}
