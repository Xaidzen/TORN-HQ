const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('Setup the order panel in the ordering channel')
    .setDefaultMemberPermissions('0'), // Admin only

  async execute(interaction) {
    logger.info(`[COMMAND] /setup-panel executed by user ${interaction.user.id}`);

    // Check if user is admin
    const adminRole = interaction.guild.roles.cache.get(config.adminRoleId);
    if (!adminRole || !interaction.member.roles.cache.has(config.adminRoleId)) {
      logger.warn(`[COMMAND] User ${interaction.user.id} attempted to use /setup-panel without admin permissions`);
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true
      });
      return;
    }

    try {
      const orderingChannel = await interaction.guild.channels.fetch(config.orderingChannelId);
      if (!orderingChannel) {
        logger.error(`[COMMAND] Ordering channel not found: ${config.orderingChannelId}`);
        await interaction.reply({
          content: 'Ordering channel not configured correctly.',
          ephemeral: true
        });
        return;
      }

      // Create embed
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Order Panel')
        .setDescription('Select an option to create a new order')
        .addFields(
          { name: 'Losses', value: 'Order verified losses for a target', inline: false },
          { name: 'Escapes', value: 'Coming soon', inline: false },
          { name: 'Bounty Placement', value: 'Coming soon', inline: false }
        )
        .setTimestamp();

      // Create select menu
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('order_select')
            .setPlaceholder('Select an order type')
            .addOptions([
              {
                label: 'Losses',
                description: 'Order verified losses for a target',
                value: 'order_losses',
                emoji: '🩹'
              },
              {
                label: 'Escapes',
                description: 'Coming soon',
                value: 'order_escapes',
                emoji: '🏃',
                disabled: true
              },
              {
                label: 'Bounty Placement',
                description: 'Coming soon',
                value: 'order_bounties',
                emoji: '🎯',
                disabled: true
              }
            ])
        );

      // Send message
      const message = await orderingChannel.send({
        embeds: [embed],
        components: [row]
      });

      logger.info(`[COMMAND] Order panel setup in channel ${orderingChannel.id}`);

      await interaction.reply({
        content: `Order panel setup successfully in ${orderingChannel}`,
        ephemeral: true
      });

    } catch (error) {
      logger.error(`[COMMAND] Error in /setup-panel: ${error.message}`);
      await interaction.reply({
        content: 'Failed to setup order panel.',
        ephemeral: true
      });
    }
  }
};