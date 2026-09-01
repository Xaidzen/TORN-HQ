const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('./database');
const logger = require('../utils/logger'); 
const config = require('../utils/config');

async function createTicketChannel(interaction, user, targetId, quantity, budget, buyerId = null) {
  const guild = interaction.guild;
  const userData = await database.getUser(user.id);

  if (!userData) {
    logger.error(`[TICKET] User ${user.id} not found in database`);
    throw new Error('You must be verified to create a ticket');
  }

  logger.info(`[TICKET] Creating ticket for user ${user.id} (${userData.torn_name})`);

  // Create private channel
  const channelName = `losses-${userData.torn_name}`;
  const category = guild.channels.cache.get(config.ticketsCategoryId);

  const channel = await guild.channels.create({
    name: channelName,
    type: 0, // GUILD_TEXT
    parent: category,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: config.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages
        ]
      },
      {
        id: config.adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages
        ]
      }
    ]
  });

  logger.info(`[TICKET] Created channel ${channel.id} for user ${user.id}`);

  // Create ticket in database
  const ticketId = await database.createTicket(
    user.id,
    buyerId,
    targetId,
    quantity,
    budget,
    channel.id
  );

  // Create embed
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('New Order Ticket')
    .setDescription(`Ticket #${ticketId}`)
    .addFields(
      { name: 'Buyer', value: `${userData.torn_name} [${userData.torn_id}]`, inline: true },
      { name: 'Target', value: targetId, inline: true },
      { name: 'Quantity', value: quantity.toString(), inline: true },
      { name: 'Budget', value: budget || 'Not specified', inline: true },
      { name: 'Status', value: 'Pending', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Staff will review your order shortly' });

  // Send message to channel
  const message = await channel.send({
    content: `<@&${config.staffRoleId}> New order ticket created!`,
    embeds: [embed]
  });

  await message.pin();
  logger.info(`[TICKET] Pinned ticket message in channel ${channel.id}`);

  return channel;
}

module.exports = {
  createTicketChannel
};
