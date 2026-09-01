const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const database = require('../modules/database');
const serviceConfig = require('../utils/serviceConfig');
const config = require('../utils/config');
const logger = require('../utils/logger');
const cryptoHelper = require('../utils/cryptoHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contract')
    .setDescription('Create a new service contract')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('Total number of services')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('buyer_target')
        .setDescription('Target buyer ID')
        .setRequired(true)),

  async execute(interaction) {
    logger.info(`[COMMAND] /contract executed by user ${interaction.user.id} in channel ${interaction.channelId}`);

    try {
      const hasStaffRole = interaction.member.roles.cache.has(config.staffRoleId);
      const hasAdminRole = interaction.member.roles.cache.has(config.adminRoleId);

      if (!hasStaffRole && !hasAdminRole) {
        logger.warn(`[COMMAND] User ${interaction.user.id} attempted to use /contract without staff/admin permissions`);
        await interaction.reply({
          content: 'You do not have permission to use this command.',
          flags: [0x1 << 6] // Ephemeral flag
        });
        return;
      }

      // Determine contract type from channel context
      const contractType = serviceConfig.getServiceTypeFromChannel(interaction.channelId);
      if (!contractType) {
        logger.warn(`[COMMAND] User ${interaction.user.id} attempted to use /contract in non-service channel ${interaction.channelId}`);
        await interaction.reply({
          content: 'This command can only be used in designated service channels.',
          flags: [0x1 << 6] // Ephemeral flag
        });
        return;
      }

      const totalAmount = interaction.options.getInteger('number');
      const buyerTarget = interaction.options.getString('buyer_target');

      // Ensure user exists in database before creating contract
      const user = await database.getUser(interaction.user.id);
      if (!user) {
        await database.saveUser(interaction.user.id, 0, 'Unverified');
      }

      // Check if buyer exists and has an API key
      const buyer = await database.getUserByTornId(buyerTarget);
      if (!buyer) {
        await interaction.reply({
          content: `Buyer with Torn ID ${buyerTarget} not found in database. Please ensure the buyer has verified their account first.`,
          flags: [0x1 << 6] // Ephemeral flag
        });
        return;
      }

      // Check if buyer has an API key
      if (!buyer.api_key) {
        // Show modal to collect API key
        const modal = new ModalBuilder()
          .setCustomId(`api_key_modal_${buyerTarget}`)
          .setTitle('Buyer API Key Required');

        const apiKeyInput = new TextInputBuilder()
          .setCustomId('api_key')
          .setLabel('Enter the buyer\'s Torn API Key')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Your Torn API key here');

        const firstActionRow = new ActionRowBuilder().addComponents(apiKeyInput);

        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        return;
      }

      // Create the contract
      await database.createContract(interaction.user.id, contractType, totalAmount, buyerTarget);

      // Get the role ID for this service type
      const roleId = serviceConfig.getRoleIdFromService(contractType);
      const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

      // Create embed message
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('New Contract Created')
        .setDescription(`A new ${contractType} contract has been created!`)
        .addFields(
          { name: 'Type', value: contractType.charAt(0).toUpperCase() + contractType.slice(1), inline: true },
          { name: 'Total Amount', value: totalAmount.toString(), inline: true },
          { name: 'Remaining', value: totalAmount.toString(), inline: true },
          { name: 'Buyer Target', value: buyerTarget, inline: true },
          { name: 'Created By', value: interaction.user.toString(), inline: false }
        )
        .setTimestamp();

      // Reply with embed and ping the appropriate role
      let content = '';
      if (role) {
        content = `${role} `;
      }

      const message = await interaction.reply({
        content: content,
        embeds: [embed],
        ephemeral: false
      });

      // Pin the contract message
      try {
        await message.pin();
        logger.info(`[COMMAND] Pinned contract message ${message.id} in channel ${interaction.channelId}`);
      } catch (pinError) {
        logger.error(`[COMMAND] Failed to pin contract message: ${pinError.message}`);
      }

      logger.info(`[COMMAND] User ${interaction.user.id} created ${contractType} contract for ${totalAmount} services`);

    } catch (error) {
      logger.error(`[COMMAND] Error in /contract: ${error.message}`);
      await interaction.reply({
        content: 'An error occurred while creating the contract.',
        flags: [0x1 << 6] // Ephemeral flag
      });
    }
  }
};