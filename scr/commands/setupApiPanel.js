const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { encrypt, validateApiKey } = require('../utils/cryptoHelper');
const { getUser, updateUserApiKey, saveUser } = require('../modules/database');
const logger = require('../utils/logger');
const config = require('../utils/config');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-api-panel')
    .setDescription('Create a persistent API key setup panel (Admin/Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('user')
        .setDescription('Discord user to target (optional)')
        .setRequired(false)),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Get the target user or use the command executor
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      // Check if user is admin or staff
      const isAdmin = targetMember.permissions.has(PermissionFlagsBits.Administrator);
      const isStaff = targetMember.roles.cache.has(config.staffRoleId);

      if (!isAdmin && !isStaff) {
        return interaction.editReply('❌ You must be an admin or staff member to use this command.');
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Link Your Torn API Key')
        .setDescription('*Link your Torn API key to unlock provider features.*\n' +
          'You may link a **Full Access** or a **Custom** key with required selections.')
        .addFields(
          {
            name: '**For Custom keys, follow the instructions below to create a key with the correct permissions:**',
            value: '1. Click **Create API Key on Torn** to open Torn with a prefilled key.\n' +
                   '2. Copy the generated key from Torn.\n' +
                   '3. Click **Add / Update API Key** to submit it securely.',
          },
          {
            name: ' Security Notice',
            value: 'Your key is stored securely using encryption and used only for operational tracking.',
          }
        )
        .setTimestamp();

      // Create the buttons
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Create API Key on Torn')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=Losses+and+More&user=attacks&company=profile%2Ccompanies%2Cdetailed%2Cemployees%2Cnews'),
          new ButtonBuilder()
            .setLabel('Add / Update API Key')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`submit_api_key_btn_${targetUser.id}`)
        );

      // Send the panel message
      const panelMessage = await interaction.channel.send({
        embeds: [embed],
        components: [row]
      });

      // Store the panel message ID in the database or as metadata
      // For now, we'll just log it
      logger.info(`[API Panel] Created panel for ${targetUser.id} in channel ${interaction.channel.id}, message ${panelMessage.id}`);

      await interaction.editReply(`✅ API key setup panel created for ${targetUser.toString()}!\n\n**Panel Location:** ${panelMessage.url}`);

    } catch (error) {
      logger.error(`[API Panel] Error creating panel: ${error.message}`);
      await interaction.editReply(`❌ Error creating API panel: ${error.message}`);
    }
  }
};