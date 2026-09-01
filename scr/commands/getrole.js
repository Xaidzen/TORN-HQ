const { SlashCommandBuilder } = require('discord.js');
const serviceConfig = require('../utils/serviceConfig');
const config = require('../utils/config');
const logger = require('../utils/logger');

function getRoleDisplayName(serviceType) {
  const roleNames = serviceConfig.parseServiceRoleNames();
  return roleNames[serviceType] || serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('get')
    .setDescription('Get a service role')
    .addSubcommand(subcommand =>
      subcommand
        .setName('role')
        .setDescription('Get a service role')
        .addStringOption(option =>
          option.setName('role')
            .setDescription('Service role to get')
            .setRequired(true)
            .addChoices(...serviceConfig.getServiceOptions()))),

  async execute(interaction) {
    logger.info(`[COMMAND] /get role executed by user ${interaction.user.id}`);

    try {
      // Check if user has verified role
      const hasVerifiedRole = interaction.member.roles.cache.has(config.verifiedRoleId);
      if (!hasVerifiedRole) {
        logger.warn(`[COMMAND] User ${interaction.user.id} attempted to use /get role without verified role`);
        await interaction.reply({
          content: 'You must be verified to use this command.',
          ephemeral: true
        });
        return;
      }

      const roleName = interaction.options.getString('role');
      const roleId = serviceConfig.getRoleIdFromService(roleName);

      if (!roleId) {
        await interaction.reply({
          content: 'Invalid role selected.',
          ephemeral: true
        });
        return;
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        await interaction.reply({
          content: 'Role not found.',
          ephemeral: true
        });
        return;
      }

      // Check if user already has the role
      const hasRole = interaction.member.roles.cache.has(roleId);

      if (hasRole) {
        // Remove the role
        const displayName = getRoleDisplayName(roleName);
        await interaction.member.roles.remove(role);
        await interaction.reply({
          content: `The ${displayName} role has been removed from you.`,
          ephemeral: true
        });
        logger.info(`[COMMAND] Removed ${roleName} role from user ${interaction.user.id}`);
      } else {
        // Add the role
        const displayName = getRoleDisplayName(roleName);
        await interaction.member.roles.add(role);
        await interaction.reply({
          content: `You have been assigned the ${displayName} role.`,
          ephemeral: true
        });
        logger.info(`[COMMAND] Assigned ${roleName} role to user ${interaction.user.id}`);
      }

    } catch (error) {
      logger.error(`[COMMAND] Error in /get role: ${error.message}`);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }
};