const {
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	MessageFlags
} = require('discord.js');

const { createTicketChannel } = require('../modules/ticketSystem');
const { verifyUser } = require('../modules/verification');
const logger = require('../utils/logger');
const database = require('../modules/database');
const cryptoHelper = require('../utils/cryptoHelper');

module.exports = {
	name: 'interactionCreate',

	async execute(interaction) {
		if (interaction.isChatInputCommand()) {
			logger.info(`[EVENT] Chat input command: ${interaction.commandName}`);

			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) return;

			try {
				await command.execute(interaction);
			} catch (error) {
				logger.error(
					`[EVENT] Error executing command ${interaction.commandName}: ${error.message}`
				);

				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral
					});
				} else {
					await interaction.reply({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral
					});
				}
			}

		} else if (interaction.isStringSelectMenu()) {
			logger.info(
				`[EVENT] String select menu interaction: ${interaction.customId}`
			);

			if (interaction.customId === 'order_select') {
				await handleOrderSelect(interaction);
			}

		} else if (interaction.isButton()) {
			logger.info(
				`[EVENT] Button interaction: ${interaction.customId}`
			);

			if (interaction.customId === 'order_button') {
				await handleOrderButton(interaction);

			} else if (
				interaction.customId.startsWith('submit_api_key_btn_')
			) {
				await handleApiKeyButton(interaction);

			} else if (
				interaction.customId.startsWith('toggle_role_')
			) {
				await handleRoleToggle(interaction);
			}

		} else if (interaction.isModalSubmit()) {
			logger.info(
				`[EVENT] Modal submit interaction: ${interaction.customId}`
			);

			if (interaction.customId === 'losses_modal') {
				await handleLossesModal(interaction);

			} else if (
				interaction.customId.startsWith('api_key_modal_')
			) {
				await handleApiKeyModal(interaction);
			}
		}
	}
};

async function handleOrderSelect(interaction) {
	logger.info(
		`[ORDER] User ${interaction.user.id} selected option: ${interaction.values[0]}`
	);

	if (interaction.values[0] === 'order_losses') {

		const userData = await database.getUser(interaction.user.id);

		const isVerified =
			userData &&
			userData.torn_id &&
			Number(userData.torn_id) > 0 &&
			userData.torn_name &&
			userData.torn_name !== 'Unverified';

		logger.info(
			`[ORDER] Verification check for ${interaction.user.id}: ${isVerified ? 'VERIFIED' : 'NOT VERIFIED'}`
		);

		if (!isVerified) {
			logger.warn(
				`[ORDER] User ${interaction.user.id} attempted to create an order without verification`
			);

			await interaction.reply({
				content: 'You must be verified to create an order.',
				flags: MessageFlags.Ephemeral
			});

			return;
		}

		const modal = new ModalBuilder()
			.setCustomId('losses_modal')
			.setTitle('Create Losses Order');

		const targetInput = new TextInputBuilder()
			.setCustomId('target_id')
			.setLabel('Target Player ID or Profile Link')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setPlaceholder('Enter target ID or profile URL');

		const quantityInput = new TextInputBuilder()
			.setCustomId('quantity')
			.setLabel('Number of Losses Needed')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setPlaceholder('Enter number of losses');

		const firstActionRow =
			new ActionRowBuilder().addComponents(targetInput);

		const secondActionRow =
			new ActionRowBuilder().addComponents(quantityInput);

		modal.addComponents(
			firstActionRow,
			secondActionRow
		);

		await interaction.showModal(modal);

		logger.info(
			`[ORDER] Showed losses modal to user ${interaction.user.id}`
		);

	} else if (interaction.values[0] === 'order_escapes') {

		await interaction.reply({
			content: 'Escapes feature is coming soon!',
			flags: MessageFlags.Ephemeral
		});

	} else if (interaction.values[0] === 'order_bounties') {

		await interaction.reply({
			content: 'Bounty placement feature is coming soon!',
			flags: MessageFlags.Ephemeral
		});
	}
}

async function handleLossesModal(interaction) {
	logger.info(
		`[ORDER] User ${interaction.user.id} submitted losses modal`
	);

	try {
		const targetId =
			interaction.fields.getTextInputValue('target_id');

		const quantity =
			parseInt(
				interaction.fields.getTextInputValue('quantity')
			);

		if (isNaN(quantity) || quantity <= 0) {
			logger.warn(
				`[ORDER] Invalid quantity from user ${interaction.user.id}:
