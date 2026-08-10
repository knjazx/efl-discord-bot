import { StringSelectMenuInteraction, TextChannel } from 'discord.js';
import { MatchService } from '../../services/matchService';
import { ResultSubmissionService } from '../../services/resultSubmissionService';
import { determineScoreAndValidate } from '../../utils/validators';
import { createAdminSubmissionEmbed, createAdminActionRow } from '../../utils/embeds';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { pendingResultSubmissions } from '../../services/submissionCache';

export async function handleSelectWinner(interaction: StringSelectMenuInteraction) {
  // 1. Defer immediately to prevent Discord 3-second interaction timeout!
  await interaction.deferReply({ ephemeral: true });

  // CustomId format: select_winner:<matchId>
  const parts = interaction.customId.split(':');
  const matchId = parts[1];

  const selectedWinnerTeamId = interaction.values[0];

  const pendingData = pendingResultSubmissions.get(matchId);
  const mapLinks: string[] = pendingData?.links || [];

  const match = await MatchService.getMatchById(matchId);
  if (!match) {
    return interaction.editReply({
      content: '❌ Матч не найден.',
    });
  }

  // Validate score alignment
  const scoreResult = determineScoreAndValidate(
    match.format,
    Math.max(1, mapLinks.length),
    selectedWinnerTeamId,
    match.team1Id,
    match.team2Id
  );

  if (!scoreResult.isValid) {
    return interaction.editReply({
      content: `❌ **Ошибка определения счёта:** ${scoreResult.error}`,
    });
  }

  // Create submission record
  try {
    const submission = await ResultSubmissionService.createSubmission({
      matchId,
      submittedBy: interaction.user.id,
      sourceChannelId: interaction.channelId,
      winnerTeamId: selectedWinnerTeamId,
      scoreTeam1: scoreResult.scoreTeam1,
      scoreTeam2: scoreResult.scoreTeam2,
      mapLinks,
    });

    // Remove from pending cache after successful DB record
    pendingResultSubmissions.delete(matchId);

    const winnerTeamName = selectedWinnerTeamId === match.team1Id ? match.team1.name : match.team2.name;

    // Send admin notification embed to MATCH_ADMIN_CHANNEL_ID
    const adminEmbed = createAdminSubmissionEmbed({
      submissionId: submission.id,
      tournamentName: match.tournament.name,
      stageName: match.stage.name,
      groupName: match.group?.name,
      team1Name: match.team1.name,
      team2Name: match.team2.name,
      winnerTeamName,
      scoreTeam1: scoreResult.scoreTeam1,
      scoreTeam2: scoreResult.scoreTeam2,
      format: match.format,
      submitterId: interaction.user.id,
      mapLinks,
    });

    const adminRow = createAdminActionRow(submission.id);

    try {
      const adminChannel = await interaction.client.channels.fetch(config.MATCH_ADMIN_CHANNEL_ID);
      if (adminChannel && adminChannel.isTextBased()) {
        await (adminChannel as TextChannel).send({
          embeds: [adminEmbed],
          components: [adminRow],
        });
      } else {
        logger.error(`Admin channel ${config.MATCH_ADMIN_CHANNEL_ID} not found or not text-based.`);
      }
    } catch (channelErr) {
      logger.error('Failed to post submission to admin channel:', channelErr);
    }

    return interaction.editReply({
      content:
        `🏆 **Заявка отправлена на проверку!**\n\n` +
        `**Матч:** ${match.team1.name} vs ${match.team2.name}\n` +
        `**Итоговый счёт:** ${match.team1.name} ${scoreResult.scoreTeam1} — ${scoreResult.scoreTeam2} ${match.team2.name}\n` +
        `**Победитель:** ${winnerTeamName}\n\n` +
        `*Результат появится в канале матча и в канале результатов после проверки администратором.*`,
    });
  } catch (error: any) {
    logger.error('Error submitting result:', error);
    return interaction.editReply({
      content: `❌ **Ошибка отправки результата:** ${error.message || error}`,
    });
  }
}
