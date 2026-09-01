const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../modules/database');
const serviceConfig = require('../utils/serviceConfig');
const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim a service')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('Number of services to claim')
        .setRequired(true)),

  async execute(interaction) {
    logger.info(`[COMMAND] /claim executed by user ${interaction.user.id} in channel ${interaction.channelId}`);

    try {
      const amount = interaction.options.getInteger('number');
      const serviceType = serviceConfig.getServiceTypeFromChannel(interaction.channelId);

      // Check if command is in a valid service channel
      if (!serviceType) {
        logger.warn(`[COMMAND] User ${interaction.user.id} attempted to use /claim in non-service channel ${interaction.channelId}`);
        await interaction.reply({
          content: 'This command can only be used in designated service channels.',
          flags: [0x1 << 6] // Ephemeral flag
        });
        return;
      }

      // Check if there's an active contract for this service
      const activeContract = await database.getActiveContract(serviceType);
      if (!activeContract) {
        await interaction.reply({
          content: `There is currently no active contract for ${serviceType}. Please wait for a staff member to create one.`,
          ephemeral: false
        });
        return;
      }

      // Validate claim amount against remaining contract amount
      let actualAmount = amount;
      if (amount > activeContract.remaining_amount) {
        actualAmount = activeContract.remaining_amount;
        await interaction.reply({
          content: `⚠️ Warning: You tried to claim ${amount}, but only ${activeContract.remaining_amount} are available. Claiming the maximum available instead!`,
          ephemeral: false
        });
      } else {
        await interaction.reply({
          content: `${interaction.user} successfully claimed ${amount} of ${serviceType}!`,
          ephemeral: false
        });
      }

      // Create the claim
      await database.createClaim(interaction.user.id, serviceType, actualAmount);

      // Update contract remaining amount
      const newRemainingAmount = activeContract.remaining_amount - actualAmount;
      await database.updateContractRemainingAmount(activeContract.id, newRemainingAmount);

      // Check if contract is completed
      if (newRemainingAmount === 0) {
        await database.updateContractStatus(activeContract.id, 'completed');

        // Unpin the completed contract message
        try {
          const pinnedMessages = await interaction.channel.messages.fetchPinned();
          const contractMessage = pinnedMessages.find(msg =>
            msg.embeds.length > 0 &&
            msg.embeds[0].title === 'New Contract Created' &&
            msg.embeds[0].fields.some(field =>
              field.name === 'Type' && field.value === serviceType.charAt(0).toUpperCase() + serviceType.slice(1)
            )
          );

          if (contractMessage) {
            await contractMessage.unpin();
            logger.info(`[COMMAND] Unpinned completed contract message ${contractMessage.id} in channel ${interaction.channelId}`);
          }
        } catch (unpinError) {
          logger.error(`[COMMAND] Failed to unpin completed contract message: ${unpinError.message}`);
        }

        // Announce contract completion
        await interaction.followUp({
          content: `🎉 The ${serviceType} contract has been officially fulfilled! No more claims can be made.`,
          ephemeral: false
        });
      }

      // Log the actual claimed amount
      logger.info(`[COMMAND] User ${interaction.user.id} claimed ${actualAmount} ${serviceType} in channel ${interaction.channelId}`);

    } catch (error) {
      logger.error(`[COMMAND] Error in /claim: ${error.message}`);
      await interaction.reply({
        content: 'An error occurred while processing your claim.',
        flags: [0x1 << 6] // Ephemeral flag
      });
    }
  }
};