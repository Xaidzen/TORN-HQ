const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
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
				logger.error(`[EVENT] Error executing command ${interaction.commandName}: ${error.message}`);
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
			logger.info(`[EVENT] String select menu interaction: ${interaction.customId}`);

			if (interaction.customId === 'order_select') {
				await handleOrderSelect(interaction);
			}
		} else if (interaction.isButton()) {
			logger.info(`[EVENT] Button interaction: ${interaction.customId}`);

			if (interaction.customId === 'order_button') {
				await handleOrderButton(interaction);
			} else if (interaction.customId.startsWith('submit_api_key_btn_')) {
				await handleApiKeyButton(interaction);
			} else if (interaction.customId.startsWith('toggle_role_')) {
				await handleRoleToggle(interaction);
			}
		} else if (interaction.isModalSubmit()) {
			logger.info(`[EVENT] Modal submit interaction: ${interaction.customId}`);

			if (interaction.customId === 'losses_modal') {
				await handleLossesModal(interaction);
			} else if (interaction.customId.startsWith('api_key_modal_')) {
				await handleApiKeyModal(interaction);
			}
		}
	}
};

async function handleOrderSelect(interaction) {
	logger.info(`[ORDER] User ${interaction.user.id} selected option: ${interaction.values[0]}`);

	if (interaction.values[0] === 'order_losses') {
		const userData = await database.getUser(interaction.user.id);
		if (!userData) {
			logger.warn(`[ORDER] User ${interaction.user.id} not verified`);
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

		const firstActionRow = new ActionRowBuilder().addComponents(targetInput);
		const secondActionRow = new ActionRowBuilder().addComponents(quantityInput);

		modal.addComponents(firstActionRow, secondActionRow);

		await interaction.showModal(modal);
		logger.info(`[ORDER] Showed losses modal to user ${interaction.user.id}`);

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
	logger.info(`[ORDER] User ${interaction.user.id} submitted losses modal`);

	try {
		const targetId = interaction.fields.getTextInputValue('target_id');
		const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));

		if (isNaN(quantity) || quantity <= 0) {
			logger.warn(`[ORDER] Invalid quantity from user ${interaction.user.id}: ${quantity}`);
			await interaction.reply({
				content: 'Please enter a valid number for the quantity.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await createTicketChannel(interaction, interaction.user, targetId, quantity, null);

		await interaction.reply({
			content: 'Your order has been created! A private channel has been set up for you.',
			flags: MessageFlags.Ephemeral
		});

	} catch (error) {
		logger.error(`[ORDER] Error handling losses modal: ${error.message}`);
		await interaction.reply({
			content: 'Failed to create your order. Please try again.',
			flags: MessageFlags.Ephemeral
		});
	}
}

async function handleApiKeyButton(interaction) {
	try {
		const targetUserId = interaction.customId.replace('submit_api_key_btn_', '');

		const isAdmin = interaction.member.permissions.has('Administrator');
		const isStaff = interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID);

		if (interaction.user.id !== targetUserId && !isAdmin && !isStaff) {
			await interaction.reply({
				content: '❌ You can only submit API keys for yourself or if you are admin/staff.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		// Instantly build and serve the modal without blocking API tasks
		const modal = new ModalBuilder()
			.setCustomId(`api_key_modal_${targetUserId}`)
			.setTitle('Torn API Key Submission');

		const apiKeyInput = new TextInputBuilder()
			.setCustomId('api_key_input')
			.setLabel('Enter your Torn API Key')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('Paste your API key here')
			.setRequired(true);

		const firstActionRow = new ActionRowBuilder().addComponents(apiKeyInput);
		modal.addComponents(firstActionRow);

		await interaction.showModal(modal);
		logger.info(`[API Key Submission] Showed modal instantly to user ${interaction.user.id}`);

} catch (error) {
    logger.error(`[API KEY] Error handling API key modal: ${error.message}`);

    await interaction.reply({
        content: `❌ API key validation failed: ${error.message}`,
        flags: MessageFlags.Ephemeral
    });
	}
	} catch (error) {
    logger.error(`[API KEY] Error handling API key modal: ${error.message}`);

    await interaction.reply({
        content: `❌ API key validation failed: ${error.message}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleRoleToggle(interaction) {
	try {
		const userData = await database.getUser(interaction.user.id);

		if (!userData || !userData.api_key) {
			logger.warn(`[ROLE] User ${interaction.user.id} attempted role toggle but has no api_key in DB`);
			await interaction.reply({
				content: '❌ You must link a valid Custom or Full Access API key using the panel above before you can select a service provider role.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const roleType = interaction.customId.replace('toggle_role_', '');

		const roleConfig = {
			losses: process.env.LOSSES_ROLE_ID,
			escapes: process.env.ESCAPES_ROLE_ID,
			bounties: process.env.BOUNTIES_ROLE_ID,
			detective: process.env.DETECTIVE_ROLE_ID
		};

		const roleId = roleConfig[roleType];
		if (!roleId) {
			logger.warn(`[ROLE] Role ID for type ${roleType} is not defined in environment variables`);
			await interaction.reply({
				content: '❌ Invalid role type.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const member = await interaction.guild.members.fetch(interaction.user.id);
		const hasRole = member.roles.cache.has(roleId);

		if (hasRole) {
			await member.roles.remove(roleId);
			await interaction.reply({
				content: '👋 Removed the role. You will no longer receive contract pings for this track.',
				flags: MessageFlags.Ephemeral
			});
			logger.info(`[ROLE] Removed ${roleType} role from ${interaction.user.id}`);
		} else {
			await member.roles.add(roleId);
			await interaction.reply({
				content: '✅ Granted the role! You are now on the notification list for new contracts.',
				flags: MessageFlags.Ephemeral
			});
			logger.info(`[ROLE] Added ${roleType} role to ${interaction.user.id}`);
		}

	} catch (error) {
		logger.error(`[ROLE] Error handling role toggle: ${error.message}`);
		await interaction.reply({
			content: `❌ Error toggling role: ${error.message}`,
			flags: MessageFlags.Ephemeral
		});
	}
} 
