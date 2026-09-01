const { verifyUser } = require('../modules/verification');
const logger = require('../utils/logger');
const database = require('../modules/database');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Only process DMs
    if (message.guild) return;

    logger.info(`[DM] Received DM from user ${message.author.id}: ${message.content.substring(0, 50)}...`);

    // Check if user has active verification session
    if (!await database.hasActiveVerification(message.author.id)) {
      logger.warn(`[DM] Ignoring DM from user ${message.author.id} - no active verification session`);
      return;
    }

    try {
      // Process API key
      const apiKey = message.content.trim();

      if (!apiKey) {
        logger.warn(`[DM] Empty API key from user ${message.author.id}`);
        await message.reply('Please provide your Torn API key.');
        return;
      }

      // Verify user
      const result = await verifyUser({
        user: message.author,
        guild: null,
        id: message.author.id,
        member: null,
        channel: message.channel,
        deferReply: async () => {},
        editReply: async () => {},
        reply: async () => {}
      }, apiKey, message.client);

      if (result.success) {
        logger.info(`[VERIFY] User ${message.author.id} verified successfully`);
        await message.reply(`Verification successful! Your Discord nickname has been updated to ${result.tornName} [${result.tornId}] and you have been assigned the verified role.`);
      }

    } catch (error) {
      logger.error(`[DM] Verification failed for user ${message.author.id}: ${error.message}`);
      await message.reply(`Verification failed: ${error.message}\n\nPlease try again with a valid Torn API key.`);
    }
  }
};