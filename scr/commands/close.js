const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket channel')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for closing the ticket')
        .setRequired(false)),

  async execute(interaction) {
    logger.info(`[COMMAND] /close executed by user ${interaction.user.id} in channel ${interaction.channel.id}`);

    try {
      // Check if command is used in a ticket channel
      const ticketsCategoryId = config.ticketsCategoryId;
      const channelCategoryId = interaction.channel.parentId;

      if (channelCategoryId !== ticketsCategoryId) {
        await interaction.reply({
          content: 'This command can only be used inside active ticket channels.',
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      const reason = interaction.options.getString('reason') || 'No reason provided';

      // Calculate deletion time (5 minutes from now)
      const deleteTimeInSeconds = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);

      // Send closure announcement
      await interaction.reply({
        content: `⚠️ **This ticket has been marked for closure by ${interaction.user}.**
This channel will be automatically deleted **<t:${deleteTimeInSeconds}:R>** at **<t:${deleteTimeInSeconds}:t>**.
_Reason: ${reason}_`
      });

      // Set timeout for channel deletion
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
          logger.info(`[COMMAND] Deleted ticket channel ${interaction.channel.id} after closure`);
        } catch (error) {
          logger.error(`[COMMAND] Error deleting channel ${interaction.channel.id}: ${error.message}`);
        }
      }, 5 * 60 * 1000); // 5 minutes

      logger.info(`[COMMAND] Ticket ${interaction.channel.id} marked for closure by user ${interaction.user.id}. Reason: ${reason}`);

    } catch (error) {
      logger.error(`[COMMAND] Error in /close: ${error.message}`);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          flags: [MessageFlags.Ephemeral]
        });
      }
    }
  }
};