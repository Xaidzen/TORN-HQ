const { decrypt, validateApiKey } = require('./cryptoHelper');
const { getUser } = require('../modules/database');
const logger = require('./logger');
const config = require('./config');
const axios = require('axios');

class KeyHealthChecker {
	constructor(client) {
		this.client = client;
		this.intervalId = null;
		this.isRunning = false;
	}

	start() {
		if (this.isRunning) {
			logger.info('[KeyHealthChecker] Already running');
			return;
		}

		this.isRunning = true;
		this.checkKeys();
		this.intervalId = setInterval(() => this.checkKeys(), 5 * 60 * 1000); // Every 5 minutes

		logger.info('[KeyHealthChecker] Started key health checker (5 minute interval)');
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
		logger.info('[KeyHealthChecker] Stopped key health checker');
	}

	/**
	 * Check all stored API keys for validity
	 */
	async checkKeys() {
		try {
			logger.info('[KeyHealthChecker] Starting key health check...');

			// Get all users with API keys
			const users = this.getAllUsersWithApiKeys();

			if (users.length === 0) {
				logger.info('[KeyHealthChecker] No users with API keys to check');
				return;
			}

			logger.info(`[KeyHealthChecker] Checking ${users.length} API key(s)...`);

			for (const user of users) {
				await this.checkSingleKey(user);
			}

			logger.info('[KeyHealthChecker] Key health check completed');
		} catch (error) {
			logger.error(`[KeyHealthChecker] Error during key health check: ${error.message}`);
		}
	}

	/**
	 * Get all users with API keys from the database
	 * @returns {Array} Array of user objects with API keys
	 */
	getAllUsersWithApiKeys() {
		try {
			const database = require('../modules/database');
			return database.getAllUsersWithApiKeys();
		} catch (error) {
			logger.error(`[KeyHealthChecker] Error getting users with API keys: ${error.message}`);
			return [];
		}
	}

	/**
	 * Check a single user's API key
	 * @param {Object} user - User object with discord_id, torn_id, torn_name, and api_key
	 */
	async checkSingleKey(user) {
		try {
			if (!user.api_key) {
				logger.debug(`[KeyHealthChecker] User ${user.discord_id} has no API key`);
				return;
			}

			// Decrypt the API key
			const apiKey = decrypt(user.api_key);
			if (!apiKey) {
				logger.warn(`[KeyHealthChecker] User ${user.discord_id} has invalid encrypted API key`);
				return;
			}

			// Validate the API key
			const validationResult = await validateApiKey(apiKey);

			if (validationResult) {
				logger.debug(`[KeyHealthChecker] User ${user.discord_id} API key is valid (${validationResult.access_type})`);
				return;
			}

			// If we get here, the key validation failed
			logger.warn(`[KeyHealthChecker] User ${user.discord_id} API key is invalid or expired`);

			// Send DM to the user
			await this.sendKeyInvalidationWarning(user);

		} catch (error) {
			logger.error(`[KeyHealthChecker] Error checking key for user ${user.discord_id}: ${error.message}`);

			// Send DM to the user about the error
			await this.sendKeyInvalidationWarning(user);
		}
	}

	/**
	 * Send a DM to the user about their invalid API key
	 * @param {Object} user - User object with discord_id
	 */
	async sendKeyInvalidationWarning(user) {
		try {
			const discordUser = await this.client.users.fetch(user.discord_id);

			if (!discordUser) {
				logger.warn(`[KeyHealthChecker] Could not find Discord user ${user.discord_id}`);
				return;
			}

			const message = '⚠️ **Action Required:** Your linked Torn API key is no longer working or has been modified. ' +
				'Please use the panel to update it so your operational tracking continues to work.';

			await discordUser.send(message);
			logger.info(`[KeyHealthChecker] Sent API key warning DM to ${user.discord_id} (${user.torn_name})`);
		} catch (error) {
			logger.error(`[KeyHealthChecker] Error sending DM to user ${user.discord_id}: ${error.message}`);
		}
	}
}

module.exports = KeyHealthChecker;