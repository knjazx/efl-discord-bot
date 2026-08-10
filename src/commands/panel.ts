import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
} from 'discord.js';
import { PermissionService } from '../services/permissionService';

export const panelCommandData = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Отправить панель подачи результатов матчей в текущий канал (Админ)');

export async function handlePanelCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора для создания панели.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Отправка результатов матчей EFL')
    .setColor(0x5865F2) // Blurple
    .setDescription(
      'Для отправки итогового результата сыгранного матча нажмите на кнопку ниже.\n\n' +
      '• Если вы находитесь в **канале конкретного матча**, бот автоматически определит команды.\n' +
      '• Если вы подаете из **общего канала**, бот предложит выбрать ваш активный матч из списка.'
    )
    .setFooter({ text: 'Electronic Future League • CS2 League System' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('submit_result_channel:generic')
    .setLabel('Отправить результат')
    .setEmoji('🏆')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  if (interaction.channel && 'send' in interaction.channel) {
    await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });
  }

  return interaction.reply({
    content: '✅ Панель подачи результатов успешно отправлена в этот канал!',
    ephemeral: true,
  });
}
