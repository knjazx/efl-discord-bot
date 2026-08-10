import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  GuildMember,
} from 'discord.js';
import { MatchService } from '../services/matchService';
import { ResultSubmissionService } from '../services/resultSubmissionService';
import { PermissionService } from '../services/permissionService';

export const resultCommandData = new SlashCommandBuilder()
  .setName('result')
  .setDescription('Подать результат сыгранного матча CS2 EFL');

export async function handleResultCommand(interaction: ChatInputCommandInteraction) {
  // Step 1: Check Channel Context
  const channelMatch = await MatchService.getMatchByChannelId(interaction.channelId);

  if (channelMatch) {
    // Current channel is a match channel! Check match status & eligibility directly
    if (channelMatch.status === 'FINISHED') {
      return interaction.reply({
        content: '⚠️ Результат этого матча уже подтверждён.',
        ephemeral: true,
      });
    }

    const activeSub = await ResultSubmissionService.getPendingSubmissionForMatch(channelMatch.id);
    if (activeSub) {
      return interaction.reply({
        content: '⚠️ Результат этого матча уже отправлен и ожидает проверки администрации.',
        ephemeral: true,
      });
    }

    const team1Members = channelMatch.team1.members.map(m => m.discordId);
    const team2Members = channelMatch.team2.members.map(m => m.discordId);
    const member = interaction.member instanceof GuildMember ? interaction.member : null;

    if (!PermissionService.canSubmitForMatch(interaction.user.id, team1Members, team2Members, member)) {
      return interaction.reply({
        content: '❌ Вы не являетесь игроком или капитаном одной из команд этого матча.',
        ephemeral: true,
      });
    }

    // Open modal directly
    const modal = new ModalBuilder()
      .setCustomId(`submit_result_modal:${channelMatch.id}`)
      .setTitle(`Result: ${channelMatch.team1.name} vs ${channelMatch.team2.name}`);

    const map1Input = new TextInputBuilder()
      .setCustomId('map1_link')
      .setLabel('Match link (Map 1)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://cybershoke.net/match/... or https://faceit.com/...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(map1Input));

    if (channelMatch.format === 'BO3') {
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

  // Step 2: Outside match channel -> Show available matches dropdown
  const availableMatches = await MatchService.getAvailableMatchesForUser(interaction.user.id);

  if (!availableMatches || availableMatches.length === 0) {
    return interaction.reply({
      content: '❌ У вас нет доступных матчей для отправки результата.',
      ephemeral: true,
    });
  }

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

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  return interaction.reply({
    content: '🏆 **Выберите матч**, результат которого вы хотите отправить:',
    components: [row],
    ephemeral: true,
  });
}
