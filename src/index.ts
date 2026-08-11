import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Interaction,
  Events,
} from 'discord.js';
import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';

// Commands
import { resultCommandData, handleResultCommand } from './commands/result';
import { matchCommandData, handleMatchCommand } from './commands/match';
import { panelCommandData, handlePanelCommand } from './commands/panel';
import { teamCommandData, handleTeamCommand } from './commands/team';
import { groupCommandData, handleGroupCommand } from './commands/group';

// Interactions
import { handleSubmitResultButton } from './interactions/buttons/submitResult';
import { handleApproveResultButton } from './interactions/buttons/approveResult';
import { handleRejectResultButton } from './interactions/buttons/rejectResult';
import { handleSubmitResultModal } from './interactions/modals/submitResultModal';
import { handleRejectReasonModal } from './interactions/modals/rejectReasonModal';
import { handleBulkAddTeamsModal } from './interactions/modals/bulkAddTeamsModal';
import { handleSelectMatch } from './interactions/selectMenus/selectMatch';
import { handleSelectWinner } from './interactions/selectMenus/selectWinner';

// HTTP Health Check Server for Render / Cloud hostings
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('EFL Discord Bot is online and healthy!\n');
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn(`Port ${port} in use for health check, skipping HTTP listener.`);
  } else {
    logger.error('Health check server error:', err);
  }
});

server.listen(port, () => {
  logger.info(`HTTP health check server listening on port ${port}`);
});

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.once(Events.ClientReady, async (c) => {
  logger.info(`🤖 EFL Discord Bot logged in as ${c.user.tag}`);

  // Register Slash Commands
  const commands = [
    resultCommandData.toJSON(),
    matchCommandData.toJSON(),
    panelCommandData.toJSON(),
    teamCommandData.toJSON(),
    groupCommandData.toJSON(),
  ];
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  try {
    logger.info('Registering application (/) commands...');
    if (config.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
        { body: commands }
      );
      logger.info(`Successfully registered commands for Guild: ${config.DISCORD_GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: commands });
      logger.info('Successfully registered global application commands.');
    }

    // Start Daily 00:00 Auto-update Cron
    const { AutoUpdateService } = await import('./services/autoUpdateService');
    AutoUpdateService.startDailyCron(c);
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // 1. Slash Commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'result') {
        await handleResultCommand(interaction);
      } else if (interaction.commandName === 'match') {
        await handleMatchCommand(interaction);
      } else if (interaction.commandName === 'panel') {
        await handlePanelCommand(interaction);
      } else if (interaction.commandName === 'team') {
        await handleTeamCommand(interaction);
      } else if (interaction.commandName === 'group') {
        await handleGroupCommand(interaction);
      }
      return;
    }

    // 2. Buttons
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('submit_result_channel')) {
        await handleSubmitResultButton(interaction);
      } else if (customId.startsWith('approve_result')) {
        await handleApproveResultButton(interaction);
      } else if (customId.startsWith('reject_result')) {
        await handleRejectResultButton(interaction);
      } else if (customId.startsWith('request_admin_help')) {
        const { handleRequestAdminHelpButton } = await import('./interactions/buttons/requestAdminHelp');
        await handleRequestAdminHelpButton(interaction);
      }
      return;
    }

    // 3. Select Menus
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      if (customId === 'select_match') {
        await handleSelectMatch(interaction);
      } else if (customId.startsWith('select_winner')) {
        await handleSelectWinner(interaction);
      }
      return;
    }

    // 4. Modals
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      if (customId.startsWith('submit_result_modal')) {
        await handleSubmitResultModal(interaction);
      } else if (customId.startsWith('reject_reason_modal')) {
        await handleRejectReasonModal(interaction);
      } else if (customId === 'bulk_add_teams_modal') {
        await handleBulkAddTeamsModal(interaction);
      } else if (customId.startsWith('admin_help_modal')) {
        const { handleAdminHelpModal } = await import('./interactions/modals/adminHelpModal');
        await handleAdminHelpModal(interaction);
      }
      return;
    }
  } catch (err: any) {
    logger.error(`Error handling interaction ${interaction.id}:`, err);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Произошла непредвиденная ошибка при обработке команды.',
          ephemeral: true,
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: '❌ Произошла непредвиденная ошибка при обработке команды.',
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }
});

import { execSync } from 'child_process';

async function main() {
  if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN === 'MOCK_DISCORD_TOKEN') {
    logger.warn('DISCORD_TOKEN is set to MOCK_DISCORD_TOKEN. Provide real token in .env to connect to live Discord API.');
    return;
  }

  try {
    logger.info('Ensuring Prisma database schema is initialized...');
    execSync('npx prisma db push --skip-generate', { stdio: 'ignore' });
  } catch (dbErr) {
    logger.warn('Prisma db push check handled.');
  }

  await client.login(config.DISCORD_TOKEN);
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Fatal error during startup:', err);
    process.exit(1);
  });
}
