import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, APIEmbed, Embed } from 'discord.js';

export interface AdminEmbedDetails {
  submissionId: string;
  tournamentName: string;
  stageName: string;
  groupName?: string;
  team1Name: string;
  team2Name: string;
  winnerTeamName: string;
  scoreTeam1: number;
  scoreTeam2: number;
  format: string;
  submitterId: string;
  mapLinks: string[];
}

export function createAdminSubmissionEmbed(details: AdminEmbedDetails): EmbedBuilder {
  const linksFormatted = details.mapLinks
    .map((url, idx) => `🗺️ **Map ${idx + 1}**: [Link](${url})`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🏆 MATCH RESULT SUBMISSION')
    .setColor(0xFEE75C) // Yellow
    .addFields(
      { name: 'Tournament', value: details.tournamentName, inline: true },
      { name: 'Stage', value: details.stageName, inline: true },
      { name: 'Group', value: details.groupName || 'N/A', inline: true },
      { name: 'Match', value: `**${details.team1Name}** vs **${details.team2Name}**`, inline: true },
      { name: 'Format', value: details.format, inline: true },
      { name: 'Submitted by', value: `<@${details.submitterId}>`, inline: true },
      { name: 'Result', value: `**${details.team1Name}** ${details.scoreTeam1} — ${details.scoreTeam2} **${details.team2Name}**`, inline: false },
      { name: 'Match links', value: linksFormatted || 'None', inline: false },
      { name: 'Status', value: '🟡 Pending Review', inline: false }
    )
    .setFooter({ text: `Submission ID: ${details.submissionId}` })
    .setTimestamp();
}

export function createAdminApprovedEmbed(
  originalEmbed: APIEmbed | Embed | EmbedBuilder,
  reviewerId: string,
  reviewedAt: Date
): EmbedBuilder {
  const embed = EmbedBuilder.from(originalEmbed);
  embed.setColor(0x57F287); // Green

  // Update status field
  const fields = embed.data.fields ? [...embed.data.fields] : [];
  const statusIdx = fields.findIndex(f => f.name === 'Status');

  const statusValue = `🟢 Approved by <@${reviewerId}>\n<t:${Math.floor(reviewedAt.getTime() / 1000)}:R>`;

  if (statusIdx !== -1) {
    fields[statusIdx] = { name: 'Status', value: statusValue, inline: false };
  } else {
    fields.push({ name: 'Status', value: statusValue, inline: false });
  }

  embed.setFields(fields);
  return embed;
}

export function createAdminRejectedEmbed(
  originalEmbed: APIEmbed | Embed | EmbedBuilder,
  reviewerId: string,
  reason: string,
  reviewedAt: Date
): EmbedBuilder {
  const embed = EmbedBuilder.from(originalEmbed);
  embed.setColor(0xED4245); // Red

  const fields = embed.data.fields ? [...embed.data.fields] : [];
  const statusIdx = fields.findIndex(f => f.name === 'Status');

  const statusValue = `🔴 Rejected by <@${reviewerId}>\n**Reason:** ${reason}\n<t:${Math.floor(reviewedAt.getTime() / 1000)}:R>`;

  if (statusIdx !== -1) {
    fields[statusIdx] = { name: 'Status', value: statusValue, inline: false };
  } else {
    fields.push({ name: 'Status', value: statusValue, inline: false });
  }

  embed.setFields(fields);
  return embed;
}

export function createAdminActionRow(submissionId: string, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_result:${submissionId}`)
      .setLabel('Approve')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`reject_result:${submissionId}`)
      .setLabel('Reject')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

export function createPlayerApprovedNotificationEmbed(
  team1Name: string,
  team2Name: string,
  scoreTeam1: number,
  scoreTeam2: number,
  reviewerId: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🟢 RESULT APPROVED')
    .setColor(0x57F287)
    .setDescription(
      `Результат матча **${team1Name}** vs **${team2Name}** подтверждён администрацией.\n\n` +
      `🏆 **Итог:** **${team1Name}** ${scoreTeam1} — ${scoreTeam2} **${team2Name}**\n\n` +
      `Проверил: <@${reviewerId}>`
    )
    .setTimestamp();
}

export function createPlayerRejectedNotificationEmbed(
  team1Name: string,
  team2Name: string,
  reason: string,
  reviewerId: string,
  submissionId: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('❌ RESULT REJECTED')
    .setColor(0xED4245)
    .setDescription(
      `Ваш результат матча **${team1Name}** vs **${team2Name}** был отклонён администрацией.\n\n` +
      `**Причина:**\n> ${reason}\n\n` +
      `Отклонено: <@${reviewerId}>\n\n` +
      `*Вы можете нажать кнопку **🏆 Submit Result** снова и отправить исправление.*`
    )
    .setFooter({ text: `Ref: ${submissionId}` })
    .setTimestamp();
}

export function createMatchCardEmbed(
  matchId: string,
  team1Name: string,
  team2Name: string,
  format: string,
  tournamentName: string,
  stageName: string,
  groupName?: string
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ MATCH: ${team1Name} vs ${team2Name}`)
    .setColor(0x5865F2) // Blurple
    .addFields(
      { name: 'Tournament', value: tournamentName, inline: true },
      { name: 'Stage', value: stageName, inline: true },
      { name: 'Group', value: groupName || 'N/A', inline: true },
      { name: 'Format', value: format, inline: true },
      { name: 'Status', value: '⚔️ Ready to Play', inline: true }
    )
    .setDescription('Используйте кнопку ниже или команду `/result` для отправки итогового результата матча.')
    .setFooter({ text: `Match ID: ${matchId}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`submit_result_channel:${matchId}`)
      .setLabel('Ввести результат')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`request_admin_help:${matchId}`)
      .setLabel('Вызвать админа')
      .setEmoji('🚨')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, row };
}

export function createAdminHelpTicketEmbed(
  matchId: string,
  team1Name: string,
  team2Name: string,
  channelId: string,
  guildId: string,
  requesterId: string,
  reason?: string
): EmbedBuilder {
  const channelLink = `https://discord.com/channels/${guildId}/${channelId}`;

  return new EmbedBuilder()
    .setTitle('🚨 ВЫЗОВ АДМИНИСТРАЦИИ В МАТЧ')
    .setColor(0xEF4444) // Crimson Red
    .addFields(
      { name: 'Матч', value: `**${team1Name}** vs **${team2Name}**`, inline: true },
      { name: 'Вызвал', value: `<@${requesterId}>`, inline: true },
      { name: 'Канал матча', value: `<#${channelId}> ([Перейти к матчу](${channelLink}))`, inline: false },
      { name: 'Причина', value: reason && reason.trim() ? reason : 'Причина не указана (срочный вызов)', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: `Match ID: ${matchId}` });
}

export function createOfficialMatchResultEmbed(
  team1Name: string,
  team2Name: string,
  winnerTeamName: string,
  scoreTeam1: number,
  scoreTeam2: number,
  format: string,
  groupName?: string,
  mapLinks?: string[]
): EmbedBuilder {
  const isTeam1Winner = scoreTeam1 > scoreTeam2;
  const winnerBadge1 = isTeam1Winner ? ' 🏆' : '';
  const winnerBadge2 = !isTeam1Winner ? ' 🏆' : '';

  const embed = new EmbedBuilder()
    .setTitle(`🏁 РЕЗУЛЬТАТ МАТЧА • ${groupName || 'Групповой этап'}`)
    .setColor(0x10B981) // Emerald Green
    .addFields(
      { name: 'Матч', value: `**${team1Name}**${winnerBadge1} vs **${team2Name}**${winnerBadge2}`, inline: true },
      { name: 'Счёт', value: `\` ${scoreTeam1} : ${scoreTeam2} \``, inline: true },
      { name: 'Формат', value: `\`${format}\``, inline: true },
      { name: 'Победитель', value: `🏆 **${winnerTeamName}**`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'ELECTRONIC FUTURE LEAGUE • CS2 Official Result' });

  if (mapLinks && mapLinks.length > 0) {
    const linksFormatted = mapLinks
      .map((url, idx) => `[Карта ${idx + 1}](${url})`)
      .join(' • ');
    embed.addFields({ name: '📊 Статистика', value: linksFormatted, inline: false });
  }

  return embed;
}
