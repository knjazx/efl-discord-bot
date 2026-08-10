import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  ChannelType,
  TextChannel,
  AttachmentBuilder,
} from 'discord.js';
import { PermissionService } from '../services/permissionService';
import { MatchService } from '../services/matchService';
import { generateDailyScheduleImageBuffer } from '../utils/imageGenerator';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export const matchCommandData = new SlashCommandBuilder()
  .setName('match')
  .setDescription('Управление матчами турнира EFL')
  .addSubcommand(sub =>
    sub
      .setName('generate-rr')
      .setDescription('Сгенерировать сетку матчей Round Robin (на 1 конкретный день или на 3 Игровых Дня)')
      .addStringOption(opt =>
        opt
          .setName('format')
          .setDescription('Формат матчей (BO1 или BO3)')
          .setRequired(true)
          .addChoices({ name: 'BO1', value: 'BO1' }, { name: 'BO3', value: 'BO3' })
      )
      .addIntegerOption(opt =>
        opt
          .setName('round')
          .setDescription('Номер дня/раунда (1, 2 или 3). Если не указано — генерирует все 3 дня.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(3)
      )
      .addBooleanOption(opt =>
        opt
          .setName('create_channels')
          .setDescription('Сразу создать приватные текстовые каналы для матчей')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('open-day-channels')
      .setDescription('Создать приватные текстовые комнаты для матчей ТЕКУЩЕГО Игрового Дня (Раунд 1, 2 или 3)')
      .addIntegerOption(opt =>
        opt
          .setName('round')
          .setDescription('Номер дня / раунда (1, 2 или 3)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(3)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('schedule')
      .setDescription('Опубликовать ЧБ расписание матчей на выбранный Игровой День (Раунд 1-3)')
      .addIntegerOption(opt =>
        opt
          .setName('round')
          .setDescription('Номер игрового дня / раунда (1, 2 или 3)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(3)
      )
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Канал для публикации расписания (например: #расписание)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName('date')
          .setDescription('Дата игрового дня (например: 12.08.2026 или 12 АВГУСТА)')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-results-channel')
      .setDescription('Настроить канал для автоматической публикации одобренных результатов матчей')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Текстовый канал (например: #результаты-матчей)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('clear-channels')
      .setDescription('Массово удалить все созданные комнаты матчей (#r1-...) на сервере (Админ)')
  );

export async function handleMatchCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора для управления матчами.',
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'generate-rr') {
    const format = interaction.options.getString('format', true);
    const createChannels = interaction.options.getBoolean('create_channels') ?? false;
    const targetRound = interaction.options.getInteger('round') || undefined;

    await interaction.deferReply({ ephemeral: true });

    try {
      const matches = await MatchService.generateRoundRobinMatches(format, createChannels, interaction.guild, targetRound);

      return interaction.editReply({
        content:
          `🎲 **Сетка матчей Round Robin ${targetRound ? `(Игровой День ${targetRound})` : '(на 3 Игровых Дня)'} сформирована!**\n\n` +
          `**Создано матчей:** ${matches.length}\n` +
          `**Формат:** ${format}\n` +
          (targetRound ? `**Раунд:** Игровой День ${targetRound}\n\n` : `**Раунды:** Раунд 1 (День 1), Раунд 2 (День 2), Раунд 3 (День 3)\n\n`) +
          `*Для открытия комнат дня используйте: /match open-day-channels round:${targetRound || 1}*`,
      });
    } catch (err: any) {
      logger.error('Error generating Round Robin matches:', err);
      return interaction.editReply({
        content: `❌ Ошибка при генерации матчей Round Robin: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'open-day-channels') {
    const roundNum = interaction.options.getInteger('round', true);
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      return interaction.editReply({ content: '❌ Команда доступна только на сервере.' });
    }

    try {
      const { createdCount, total, errors } = await MatchService.openDayChannels(roundNum, interaction.guild);

      let msg = `🟢 **Игровой День ${roundNum}:** Успешно создано/открыто **${createdCount} из ${total}** приватных комнат!`;
      if (errors.length > 0) {
        msg += `\n\n⚠️ **Ошибки при создании (${errors.length}):**\n` + errors.slice(0, 5).join('\n');
      }

      return interaction.editReply({ content: msg });
    } catch (err: any) {
      logger.error(`Error opening day channels for round ${roundNum}:`, err);
      return interaction.editReply({
        content: `❌ Ошибка при создании комнат: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'schedule') {
    const roundNum = interaction.options.getInteger('round', true);
    const targetChannel = interaction.options.getChannel('channel', true) as TextChannel;
    const dateInput = interaction.options.getString('date') || undefined;

    await interaction.deferReply({ ephemeral: true });

    try {
      const matches = await MatchService.getMatchesByRound(roundNum);

      if (matches.length === 0) {
        return interaction.editReply({
          content: `ℹ️ Матчи на **Игровой День ${roundNum}** не найдены. Сначала сгенерируйте их через \`/match generate-rr round:${roundNum}\`.`,
        });
      }

      const groupsMap = new Map<string, any[]>();
      for (const m of matches) {
        const grpName = m.group ? m.group.name : 'Без группы';
        if (!groupsMap.has(grpName)) {
          groupsMap.set(grpName, []);
        }
        groupsMap.get(grpName)!.push(m);
      }

      const groupsScheduleData = Array.from(groupsMap.entries()).map(([grpName, mList]) => ({
        groupName: grpName,
        matches: mList.map(m => ({
          team1Name: m.team1.name,
          team1Tag: m.team1.tag,
          team2Name: m.team2.name,
          team2Tag: m.team2.tag,
          format: m.format,
        })),
      }));

      const imageBuffer = await generateDailyScheduleImageBuffer(roundNum, groupsScheduleData, dateInput);
      const attachment = new AttachmentBuilder(imageBuffer, { name: `efl-schedule-day-${roundNum}.png` });

      // Send image graphic attachment first
      await targetChannel.send({ files: [attachment] });

      // Split captain notifications into chunks of <= 1800 characters
      const textChunks: string[] = [];
      const dateTextHeader = dateInput ? ` • ${dateInput}` : '';
      let currentChunk = `📅 **ОФИЦИАЛЬНОЕ РАСПИСАНИЕ МАТЧЕЙ EFL • ИГРОВОЙ ДЕНЬ / РАУНД ${roundNum}${dateTextHeader}**\n\n`;

      for (const [grpName, mList] of groupsMap.entries()) {
        let groupBlock = `📁 **${grpName}**\n`;
        for (const m of mList) {
          const cap1 = m.team1.members.find((mem: any) => mem.role === 'CAPTAIN');
          const cap2 = m.team2.members.find((mem: any) => mem.role === 'CAPTAIN');
          const cap1Str = cap1 ? `<@${cap1.discordId}>` : m.team1.name;
          const cap2Str = cap2 ? `<@${cap2.discordId}>` : m.team2.name;

          groupBlock += `⚔️ **${m.team1.name}** (${cap1Str}) vs **${m.team2.name}** (${cap2Str}) — \`[${m.format}]\`\n`;
        }
        groupBlock += '\n';

        if (currentChunk.length + groupBlock.length > 1800) {
          textChunks.push(currentChunk);
          currentChunk = groupBlock;
        } else {
          currentChunk += groupBlock;
        }
      }

      if (currentChunk.trim().length > 0) {
        textChunks.push(currentChunk);
      }

      for (const chunk of textChunks) {
        await targetChannel.send({ content: chunk });
      }

      return interaction.editReply({
        content: `🟢 Расписание на **Игровой День ${roundNum}** с картинкой успешно опубликовано в канале ${targetChannel}!`,
      });
    } catch (err: any) {
      logger.error('Error publishing schedule:', err);
      return interaction.editReply({
        content: `❌ Ошибка при публикации расписания: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'set-results-channel') {
    const targetChan = interaction.options.getChannel('channel', true) as TextChannel;
    await interaction.deferReply({ ephemeral: true });

    try {
      const { AutoUpdateService } = await import('../services/autoUpdateService');
      await AutoUpdateService.setResultsChannel(targetChan.id);

      return interaction.editReply({
        content: `🟢 **Канал публикаций результатов матчей успешно установлен:** ${targetChan}\n\n*Сразу после одобрения админом официальная карточка результата с итоговым счётом и ссылками на матч будет публиковаться в этом канале!*`,
      });
    } catch (err: any) {
      logger.error('Error setting results channel:', err);
      return interaction.editReply({
        content: `❌ Ошибка при установке канала результатов: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'clear-channels') {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      return interaction.editReply({ content: '❌ Команда доступна только на сервере.' });
    }

    try {
      const channels = await interaction.guild.channels.fetch();
      let deletedCount = 0;

      for (const [id, channel] of channels) {
        if (
          channel &&
          (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildCategory) &&
          (channel.name.startsWith('match-') || channel.name.startsWith('r1-') || channel.name.startsWith('r2-') || channel.name.startsWith('r3-') || channel.name.includes('МАТЧИ'))
        ) {
          try {
            await channel.delete('Bulk channel cleanup');
            deletedCount++;
          } catch (delErr) {
            logger.warn(`Failed deleting channel ${channel.name}:`, delErr);
          }
        }
      }

      await prisma.match.updateMany({
        data: { channelId: null },
      });

      return interaction.editReply({
        content: `🗑️ **Успешно удалено ${deletedCount} комнат и категорий матчей!**`,
      });
    } catch (err: any) {
      logger.error('Error clearing match channels:', err);
      return interaction.editReply({
        content: `❌ Ошибка при удалении каналов: ${err.message || err}`,
      });
    }
  }
}
