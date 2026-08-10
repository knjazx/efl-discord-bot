import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { MatchService } from '../../services/matchService';

export async function handleSelectMatch(interaction: StringSelectMenuInteraction) {
  const matchId = interaction.values[0];
  const match = await MatchService.getMatchById(matchId);

  if (!match) {
    return interaction.reply({
      content: '❌ Выбранный матч не найден.',
      ephemeral: true,
    });
  }

  // Create Modal dynamically based on match format (BO1 vs BO3)
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
