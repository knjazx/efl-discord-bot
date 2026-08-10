import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { PermissionService } from '../services/permissionService';
import { TeamService } from '../services/teamService';

export const teamCommandData = new SlashCommandBuilder()
  .setName('team')
  .setDescription('Управление командами и капитанами EFL')
  .addSubcommand(sub =>
    sub
      .setName('add')
      .setDescription('Добавить команду и привязать капитана')
      .addStringOption(opt => opt.setName('name').setDescription('Название команды').setRequired(true))
      .addStringOption(opt => opt.setName('tag').setDescription('Тег команды (например: NPC)').setRequired(true))
      .addUserOption(opt => opt.setName('captain').setDescription('Упоминание капитана в Discord').setRequired(false))
      .addStringOption(opt => opt.setName('captain_id').setDescription('Или Discord ID капитана').setRequired(false))
  )
  .addSubcommand(sub =>
    sub
      .setName('bulk-add')
      .setDescription('Массовое добавление команд в формате: Название [ТЕГ] - DiscordID')
  )
  .addSubcommand(sub =>
    sub
      .setName('delete')
      .setDescription('Удалить команду по названию или тегу')
      .addStringOption(opt => opt.setName('team').setDescription('Название или Тег команды (например: NPC)').setRequired(true))
  )
  .addSubcommand(sub =>
    sub
      .setName('clear-all')
      .setDescription('Удалить абсолютно все зарегистрированные команды (Суперадмин)')
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('Посмотреть список всех зарегистрированных команд и капитанов')
  );

export async function handleTeamCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (!PermissionService.isMatchAdmin(member)) {
    return interaction.reply({
      content: '❌ У вас нет прав администратора для управления командами.',
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const name = interaction.options.getString('name', true);
    const tag = interaction.options.getString('tag', true).toUpperCase();
    const captainUser = interaction.options.getUser('captain');
    const captainIdInput = interaction.options.getString('captain_id');

    const captainDiscordId = captainUser?.id || captainIdInput?.trim();

    if (!captainDiscordId) {
      return interaction.reply({
        content: '❌ Укажите капитана через выпадающий список пользователей или передайте его `captain_id`.',
        ephemeral: true,
      });
    }

    try {
      const { team, captain } = await TeamService.createTeamWithCaptain(
        name,
        tag,
        captainDiscordId,
        captainUser?.username
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Команда успешно зарегистрирована')
        .setColor(0x57F287)
        .addFields(
          { name: 'Команда', value: `**${team.name}** [${team.tag}]`, inline: true },
          { name: 'Капитан', value: `<@${captain.discordId}> (\`${captain.discordId}\`)`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (err: any) {
      return interaction.reply({
        content: `❌ Ошибка при создании команды: ${err.message || err}`,
        ephemeral: true,
      });
    }
  }

  if (subcommand === 'bulk-add') {
    const modal = new ModalBuilder()
      .setCustomId('bulk_add_teams_modal')
      .setTitle('Массовое добавление команд');

    const input = new TextInputBuilder()
      .setCustomId('teams_text_input')
      .setLabel('Список команд (Название [ТЕГ] - DiscordID)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        'NPC Esports [NPC] - 123456789012345678\n' +
        'Xtreme Gaming [XTR] - 987654321098765432'
      )
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

    return interaction.showModal(modal);
  }

  if (subcommand === 'delete') {
    const query = interaction.options.getString('team', true);
    const result = await TeamService.deleteTeamByTagOrName(query);

    if (!result.success || !result.team) {
      return interaction.reply({
        content: `❌ ${result.message}`,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `🗑️ Команда **${result.team.name}** [${result.team.tag}] успешно удалена из базы данных.`,
    });
  }

  if (subcommand === 'clear-all') {
    if (!PermissionService.isSuperAdmin(member)) {
      return interaction.reply({
        content: '❌ Очистка всех команд доступна только Super Admin.',
        ephemeral: true,
      });
    }

    const count = await TeamService.deleteAllTeams();
    return interaction.reply({
      content: `🗑️ **Все команды (${count} шт.) были успешно удалены из базы данных.**`,
    });
  }

  if (subcommand === 'list') {
    const teams = await TeamService.getAllTeams();

    if (teams.length === 0) {
      return interaction.reply({
        content: 'ℹ️ На данный момент нет зарегистрированных команд.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🏆 Зарегистрированные команды EFL')
      .setColor(0x5865F2)
      .setDescription(
        teams
          .map((t, idx) => {
            const captain = t.members.find(m => m.role === 'CAPTAIN');
            const captainStr = captain ? `<@${captain.discordId}>` : 'Не назначен';
            return `**${idx + 1}. ${t.name}** [${t.tag}] — Капитан: ${captainStr} (Очки: ${t.points})`;
          })
          .join('\n')
      )
      .setFooter({ text: `Всего команд: ${teams.length}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
}
