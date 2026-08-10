import {
  ModalSubmitInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  GuildMember,
} from 'discord.js';
import { MatchService } from '../../services/matchService';
import { validateMatchLinks } from '../../utils/validators';
import { config } from '../../config';
import { PermissionService } from '../../services/permissionService';
import { pendingResultSubmissions } from '../../services/submissionCache';

export async function handleSubmitResultModal(interaction: ModalSubmitInteraction) {
  // CustomID format: submit_result_modal:<matchId>
  const matchId = interaction.customId.split(':')[1];
  const match = await MatchService.getMatchById(matchId);

  if (!match) {
    return interaction.reply({
      content: '❌ Ошибка: Указанный матч не найден.',
      ephemeral: true,
    });
  }

  // Check server-side permissions
  const team1Members = match.team1.members.map(m => m.discordId);
  const team2Members = match.team2.members.map(m => m.discordId);
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.canSubmitForMatch(interaction.user.id, team1Members, team2Members, member)) {
    return interaction.reply({
      content: '❌ Вы не являетесь игроком или капитаном одной из команд этого матча.',
      ephemeral: true,
    });
  }

  // Extract raw links from modal fields
  const map1 = interaction.fields.getTextInputValue('map1_link');
  const map2 = interaction.fields.fields.has('map2_link') ? interaction.fields.getTextInputValue('map2_link') : '';
  const map3 = interaction.fields.fields.has('map3_link') ? interaction.fields.getTextInputValue('map3_link') : '';

  const rawLinks = [map1, map2, map3].filter(l => Boolean(l && l.trim()));

  // Validate links against allowed domains and format
  const linkValidation = validateMatchLinks(match.format, rawLinks, config.allowedDomains);
  if (!linkValidation.isValid) {
    return interaction.reply({
      content: `❌ **Ошибка валидации ссылок:**\n${linkValidation.error}`,
      ephemeral: true,
    });
  }

  const cleanLinks = linkValidation.cleanLinks || [];

  // Cache pending links securely without hitting Discord's 100 character customId limit
  pendingResultSubmissions.set(matchId, {
    userId: interaction.user.id,
    links: cleanLinks,
  });

  const selectWinnerMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_winner:${matchId}`)
    .setPlaceholder('Выберите команду-победителя матча...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(match.team1.name)
        .setValue(match.team1.id)
        .setDescription(`Победитель: ${match.team1.name}`)
        .setEmoji('🏆'),
      new StringSelectMenuOptionBuilder()
        .setLabel(match.team2.name)
        .setValue(match.team2.id)
        .setDescription(`Победитель: ${match.team2.name}`)
        .setEmoji('🏆')
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectWinnerMenu);

  return interaction.reply({
    content:
      `✅ **Ссылка на матч принята!** (${cleanLinks.length} шт.)\n\n` +
      `Теперь выберите победителя матча **${match.team1.name}** vs **${match.team2.name}**:`,
    components: [row],
    ephemeral: true,
  });
}
