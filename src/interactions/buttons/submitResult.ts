import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  GuildMember,
} from 'discord.js';
import { MatchService } from '../../services/matchService';
import { PermissionService } from '../../services/permissionService';
import { ResultSubmissionService } from '../../services/resultSubmissionService';

export async function handleSubmitResultButton(interaction: ButtonInteraction) {
  // Custom ID format: submit_result_channel:<matchId> or generic submit_result_channel
  const parts = interaction.customId.split(':');
  let matchId = parts[1];

  let match;
  if (matchId && matchId !== 'generic') {
    match = await MatchService.getMatchById(matchId);
  } else {
    match = await MatchService.getMatchByChannelId(interaction.channelId);
  }

  if (!match) {
    // Pressed from general channel panel! Fetch available matches for the user
    const availableMatches = await MatchService.getAvailableMatchesForUser(interaction.user.id);

    if (!availableMatches || availableMatches.length === 0) {
      return interaction.reply({
        content: '❌ У вас нет доступных матчей для отправки результата.',
        ephemeral: true,
      });
    }

    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = await import('discord.js');

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_match')
      .setPlaceholder('Выберите матч для отправки результата...')
      .addOptions(
        availableMatches.map(m => {
          const stageInfo = `${m.group ? m.group.name : m.stage.name} • ${m.format}`;
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${m.team1.name} vs ${m.team2.name}`)
            .setValue(m.id)
            .setDescription(stageInfo)
            .setEmoji('⚔️');
        })
      );

    const row = new ActionRowBuilder<any>().addComponents(selectMenu);

    return interaction.reply({
      content: '🏆 **Выберите матч**, результат которого вы хотите отправить:',
      components: [row],
      ephemeral: true,
    });
  }

  // Check server-side permission
  const team1Members = match.team1.members.map(m => m.discordId);
  const team2Members = match.team2.members.map(m => m.discordId);
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.canSubmitForMatch(interaction.user.id, team1Members, team2Members, member)) {
    return interaction.reply({
      content: '❌ Вы не являетесь игроком или капитаном одной из команд этого матча.',
      ephemeral: true,
    });
  }

  // Check if match is already finished or active submission exists
  if (match.status === 'FINISHED') {
    return interaction.reply({
      content: '⚠️ Результат этого матча уже подтверждён.',
      ephemeral: true,
    });
  }

  const activeSubmission = await ResultSubmissionService.getPendingSubmissionForMatch(match.id);
  if (activeSubmission) {
    return interaction.reply({
      content: '⚠️ Результат этого матча уже находится на рассмотрении администрации.',
      ephemeral: true,
    });
  }

  // Open modal
  const modal = new ModalBuilder()
    .setCustomId(`submit_result_modal:${match.id}`)
    .setTitle(`Result: ${match.team1.name} vs ${match.team2.name}`);

  const map1Input = new TextInputBuilder()
    .setCustomId('map1_link')
    .setLabel('Match link (Map 1)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://cybershoke.net/match/... or https://faceit.com/...')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(map1Input));

  if (match.format === 'BO3') {
    const map2Input = new TextInputBuilder()
      .setCustomId('map2_link')
      .setLabel('Match link (Map 2)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://cybershoke.net/match/...')
      .setRequired(true);

    const map3Input = new TextInputBuilder()
      .setCustomId('map3_link')
      .setLabel('Match link (Map 3 - optional if 2:0)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Оставьте пустым, если счёт 2:0 / 0:2')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(map2Input),
      new ActionRowBuilder<TextInputBuilder>().addComponents(map3Input)
    );
  }

  return interaction.showModal(modal);
}
