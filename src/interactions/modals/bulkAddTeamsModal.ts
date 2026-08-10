import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import { TeamService } from '../../services/teamService';

export async function handleBulkAddTeamsModal(interaction: ModalSubmitInteraction) {
  const text = interaction.fields.getTextInputValue('teams_text_input');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  await interaction.deferReply();

  const results = await TeamService.bulkAddTeams(lines, interaction.guild);

  const successCount = results.filter(r => r.success).length;

  const embed = new EmbedBuilder()
    .setTitle('📊 Отчет о массовом импорте команд')
    .setColor(successCount > 0 ? 0x57F287 : 0xED4245)
    .setDescription(
      results
        .map(r => (r.success ? `✅ ${r.message}` : `❌ \`${r.line}\`: ${r.message}`))
        .join('\n')
    )
    .setFooter({ text: `Успешно обработано: ${successCount} из ${lines.length}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
