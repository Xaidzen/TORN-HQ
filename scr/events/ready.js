const { Events } = require('discord.js');
const database = require('../modules/database');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.info(`[BOT] Logged in as ${client.user.tag}!`);

    // Initialize database
    database.initializeDatabase();
    logger.info('[BOT] Database initialized');

    // Register commands
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    client.application.commands.set(commands);
    logger.info(`[BOT] Registered ${commands.length} commands`);

    logger.info('[BOT] Ready to process interactions');
  }
};