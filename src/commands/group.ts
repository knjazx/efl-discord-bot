import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  AttachmentBuilder,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { PermissionService } from '../services/permissionService';
import { GroupService } from '../services/groupService';
import { generateGroupsImageBuffer } from '../utils/imageGenerator';
import { logger } from '../utils/logger';

export const groupCommandData = new SlashCommandBuilder()
  .setName('group')
  .setDescription('Управление группами и турнирной таблицей EFL')
  .addSubcommand(sub =>
    sub
      .setName('generate')
      .setDescription('Сгенерировать группы (например: 8 групп по 4 команды)')
      .addIntegerOption(opt =>
        opt
          .setName('groups_count')
          .setDescription('Количество групп (например: 8)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(16)
      )
      .addIntegerOption(opt =>
        opt
          .setName('teams_per_group')
          .setDescription('Количество команд в одной группе (например: 4)')
          .setRequired(true)
          .setMinValue(2)
          .setMaxValue(32)
      )
      .addBooleanOption(opt =>
        opt
          .setName('randomize')
          .setDescription('Перемешать команды случайно перед распределением')
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName('target_channel')
          .setDescription('Канал для публикации ЧБ картинки (необязательно)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-channel')
      .setDescription('Настроить канал для авто-обновления картинки таблицы (#сетка) при победах/поражениях и в 00:00')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Текстовый канал (например: #сетка)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('Показать ЧБ картинку текущей турнирной таблицы групп')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Необязательно: канал для публикации картинки')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('clear')
      .setDescription('Удалить все созданные группы (Админ)')
  );

export async function handleGroupCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора для управления группами.',
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'generate') {
    const groupsCount = interaction.options.getInteger('groups_count', true);
    const teamsPerGroup = interaction.options.getInteger('teams_per_group', true);
    const randomize = interaction.options.getBoolean('randomize') ?? true;
    const targetChannel = interaction.options.getChannel('target_channel') as TextChannel | null;

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await GroupService.generateGroups(groupsCount, teamsPerGroup, randomize);

      const imageData = result.groups.map(g => ({
        name: g.name,
        teams: g.teams.map((gt: any) => {
          const captain = gt.team.members.find((m: any) => m.role === 'CAPTAIN');
          return {
            name: gt.team.name,
            tag: gt.team.tag,
            captainUsername: captain?.username,
          };
        }),
      }));

      const imageBuffer = await generateGroupsImageBuffer(imageData);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'efl-groups-grid.png' });

      if (targetChannel) {
        await targetChannel.send({ files: [attachment] });
        return interaction.editReply({
          content: `🟢 Группы сгенерированы! Изображение сетки опубликовано в канале ${targetChannel}.`,
        });
      }

      return interaction.editReply({
        content: `🟢 Успешно сформировано **${groupsCount} групп по ${teamsPerGroup} команд**!`,
        files: [attachment],
      });
    } catch (err: any) {
      logger.error('Error generating groups with image:', err);
      return interaction.editReply({
        content: `❌ Ошибка при генерации групп: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'set-channel') {
    const targetChannel = interaction.options.getChannel('channel', true) as TextChannel;
    const { AutoUpdateService } = await import('../services/autoUpdateService');
    await AutoUpdateService.setTargetChannel(targetChannel.id);

    return interaction.reply({
      content: `🟢 Канал ${targetChannel} настроен для **автоматического обновления таблицы групп** при каждом подтверждении результата матча и в 00:00!`,
    });
  }

  if (subcommand === 'list') {
    const targetChannel = interaction.options.getChannel('channel') as TextChannel | null;
    await interaction.deferReply({ ephemeral: !targetChannel });

    try {
      const groups = await GroupService.getGroupsWithTeams();

      if (groups.length === 0) {
        return interaction.editReply({
          content: 'ℹ️ Группы ещё не созданы. Используйте `/group generate` для их генерации.',
        });
      }

      const imageData = groups.map(g => ({
        name: g.name,
        teams: g.teams.map((gt: any) => {
          const captain = gt.team.members.find((m: any) => m.role === 'CAPTAIN');
          return {
            name: gt.team.name,
            tag: gt.team.tag,
            wins: gt.team.wins,
            losses: gt.team.losses,
            points: gt.team.points,
            captainUsername: captain?.username,
          };
        }),
      }));

      const imageBuffer = await generateGroupsImageBuffer(imageData);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'efl-groups-grid.png' });

      if (targetChannel) {
        await targetChannel.send({ files: [attachment] });
        return interaction.editReply({
          content: `🟢 Изображение таблицы групп успешно опубликовано в канале ${targetChannel}!`,
        });
      }

      return interaction.editReply({ files: [attachment] });
    } catch (err: any) {
      logger.error('Error rendering groups grid:', err);
      return interaction.editReply({
        content: `❌ Ошибка при отображении таблицы: ${err.message || err}`,
      });
    }
  }

  if (subcommand === 'clear') {
    const count = await GroupService.clearAllGroups();
    return interaction.reply({
      content: `🗑️ **Все группы (${count} шт.) удалены.**`,
    });
  }
}
