const database = require('./database');
const tornApi = require('./tornApi');
const logger = require('../utils/logger');
const config = require('../utils/config');

async function verifyUser(interaction, userKey, client) {
  const userId = interaction.user.id;
  const guild = interaction.guild || client.guilds.cache.get(config.targetGuildId);

  logger.info(`[VERIFY] User ${userId} attempting verification`);

  // Check if user has active verification session
  if (await database.hasActiveVerification(userId)) {
    logger.info(`[VERIFY] User ${userId} has active verification session - proceeding with verification`);
  } else {
    // Start verification session (15-minute timeout in milliseconds)
    const expiresAt = Date.now() + (15 * 60 * 1000);
    logger.info(`[DEBUG CMD] Attempting to save session for ID: ${userId}, expires: ${expiresAt}`);
    try {
      await database.startVerificationSession(userId, expiresAt);
      logger.info(`[DEBUG CMD] Successfully saved session for ID: ${userId}`);
    } catch (err) {
      logger.error(`[DEBUG CMD] FAILED TO SAVE SESSION: ${err.message}`, err);
      throw err;
    }
  }

  try {
    // Request 1: Identity check
    logger.info(`[VERIFY] Checking Discord identity for user ${userId}`);
    const identityResponse = await tornApi.getDiscordIdentity(userKey);

    if (!identityResponse.data.discord) {
      logger.error(`[VERIFY] No discord data in identity response for user ${userId}`);
      throw new Error('Invalid API key: No Discord information found');
    }

    if (identityResponse.data.discord.discord_id !== userId) {
      logger.warn(`[SECURITY] Discord ID mismatch for user ${userId}. Expected: ${userId}, Got: ${identityResponse.data.discord.discord_id}`);
      throw new Error('Security check failed: Discord identity verification mismatch');
    }

    logger.info(`[VERIFY] Discord identity verified for user ${userId}`);

    // Request 2: Profile fetch
    logger.info(`[VERIFY] Fetching profile for user ${userId}`);
    const profileResponse = await tornApi.getProfile(userKey);

    if (!profileResponse.data.profile) {
      logger.error(`[VERIFY] No profile data in response for user ${userId}`);
      throw new Error('Invalid API key: No profile information found');
    }

    const { id: tornId, name: tornName } = profileResponse.data.profile;

    // Save to database (no API key stored)
    await database.saveUser(userId, tornId, tornName);

    // Update nickname
    try {
      const member = await guild.members.fetch(userId);
      await member.setNickname(`${tornName} [${tornId}]`);
      logger.info(`[VERIFY] Updated nickname for ${userId} to ${tornName} [${tornId}]`);
    } catch (error) {
      if (error.code === 50013) {
        logger.error(`[SECURITY] MISSING PERMISSIONS: Bot role hierarchy is too low to modify user ${userId}`);
        logger.error(`[SECURITY] Please ensure the bot's role is above the user's top role in the server settings`);
      } else {
        logger.error(`[VERIFY] Failed to update nickname for ${userId}: ${error.message}`);
      }
      // Continue even if nickname update fails
    }

    // Assign verified role
    try {
      const member = await guild.members.fetch(userId);
      const verifiedRole = guild.roles.cache.get(config.verifiedRoleId);
      if (verifiedRole) {
        await member.roles.add(verifiedRole);
        logger.info(`[VERIFY] Assigned verified role to ${userId}`);
      } else {
        logger.error(`[VERIFY] Verified role not found: ${config.verifiedRoleId}`);
      }
    } catch (error) {
      if (error.code === 50013) {
        logger.error(`[SECURITY] MISSING PERMISSIONS: Bot role hierarchy is too low to assign role to user ${userId}`);
        logger.error(`[SECURITY] Please ensure the bot's role is above the user's top role in the server settings`);
      } else {
        logger.error(`[VERIFY] Failed to assign verified role to ${userId}: ${error.message}`);
      }
      throw error;
    }

    return { success: true, tornId, tornName };
  } finally {
    // Clean up verification session
    await database.endVerificationSession(userId);
  }
}

module.exports = {
  verifyUser
};
