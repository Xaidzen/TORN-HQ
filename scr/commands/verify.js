const { SlashCommandBuilder } = require('discord.js');
const database = require('../modules/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Torn City account with Discord'),

  async execute(interaction) {
    logger.info(`[COMMAND] /verify executed by user ${interaction.user.id}`);

    try {
      await interaction.deferReply({ ephemeral: true });

      // Start verification session in database
      const expiresAt = Date.now() + (15 * 60 * 1000);
      logger.info(`[SESSION] Starting verification session for user ${interaction.user.id}, expires at ${expiresAt}`);
      await database.startVerificationSession(interaction.user.id, expiresAt);
      logger.info(`[SESSION] Verification session created for user ${interaction.user.id}`);

      // Send DM to user
      const dmChannel = await interaction.user.createDM();
      await dmChannel.send({
        content: 'Welcome! Please reply directly to this message with your Public Torn API Key to verify your account.'
      });
      logger.info(`[DM] Sent verification request to user ${interaction.user.id}`);

      await interaction.editReply({
        content: 'I have sent you a DM to complete your verification!'
      });

    } catch (error) {
      logger.error(`[COMMAND] Error in /verify: ${error.message}`);
      await interaction.editReply({
        content: 'Failed to send verification DM. Please ensure you have DMs enabled with this server.'
      });
    }
  }
};
