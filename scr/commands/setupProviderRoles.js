const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const config = require('../utils/config');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup-provider-roles')
		.setDescription('Create a provider roles selection panel (Admin/Staff only)')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		try {
			await interaction.deferReply({ ephemeral: true });

			// Check if user is admin or staff
			const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
			const isStaff = interaction.member.roles.cache.has(config.staffRoleId);

			if (!isAdmin && !isStaff) {
				return interaction.editReply('❌ You must be an admin or staff member to use this command.');
			}

			// Create the embed
			const embed = new EmbedBuilder()
				.setColor('#00ff00')
				.setTitle('Provider Roles')
				.setDescription('*Choose which services you want to provide.*')
				.addFields(
					{
						name: 'Requirements',
						value: 'Most provider roles require a **linked Torn API key** and may be subject to staff approval.',
					},
					{
						name: '**Loss Seller**',
						value: 'Provide safe, verified losses for our buyers.',
					},
					{
						name: '**Escape Seller**',
						value: 'Provide fast escapes for buyers.',
					},
					{
						name: '**Bounty Placer**',
						value: 'Place bounties on targets.',
					},
					{
						name: '**Detective Agency**',
						value: 'Provide company perks like Friend or Foe, FLight delays and more',
					},
					{
						name: 'Future Services',
						value: 'More services and roles will be added over time.',
					}
				)
				.setTimestamp();

			const roleButtons = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setLabel('❌ Loss Seller')
						.setStyle(ButtonStyle.Success)
						.setCustomId('toggle_role_losses'),
					new ButtonBuilder()
						.setLabel('🏃 Escape Seller')
						.setStyle(ButtonStyle.Success)
						.setCustomId('toggle_role_escapes'),
					new ButtonBuilder()
						.setLabel('🎯 Bounty Placer')
						.setStyle(ButtonStyle.Success)
						.setCustomId('toggle_role_bounties'),
					new ButtonBuilder()
						.setLabel('🕵️ Detective Agency')
						.setStyle(ButtonStyle.Success)
						.setCustomId('toggle_role_detective')
				);

			// Send the panel message
			const panelMessage = await interaction.channel.send({
				embeds: [embed],
				components: [roleButtons]
			});

			logger.info(`[Provider Roles] Created roles panel in channel ${interaction.channel.id}, message ${panelMessage.id}`);

			await interaction.editReply(`✅ Provider roles selection panel created!\n\n**Panel Location:** ${panelMessage.url}`);

		} catch (error) {
			logger.error(`[Provider Roles] Error creating panel: ${error.message}`);
			await interaction.editReply(`❌ Error creating provider roles panel: ${error.message}`);
		}
	}
};