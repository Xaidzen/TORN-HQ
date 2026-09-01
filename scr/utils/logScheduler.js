const cron = require('node-cron');
const axios = require('axios');
const logger = require('./logger');
const config = require('./config');
const database = require('../modules/database');
const cryptoHelper = require('./cryptoHelper');
const tornLogMap = require('./tornLogMap');
const { Client } = require('discord.js');

class LogScheduler {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
    this.lastRunTimes = {};
  }

  /**
   * Start the log scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn('[LOG SCHEDULER] Scheduler is already running');
      return;
    }

    logger.info('[LOG SCHEDULER] Starting log scheduler...');

    // Run every 30 seconds
    this.task = cron.schedule('*/30 * * * * *', () => {
      this.checkLogs().catch(err => {
        logger.error(`[LOG SCHEDULER] Error in scheduled task: ${err.message}`);
      });
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    logger.info('[LOG SCHEDULER] Log scheduler started successfully');
  }

  /**
   * Stop the log scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[LOG SCHEDULER] Scheduler is not running');
      return;
    }

    if (this.task) {
      this.task.stop();
    }

    this.isRunning = false;
    logger.info('[LOG SCHEDULER] Log scheduler stopped');
  }

  /**
   * Check logs for all active contracts
   */
  async checkLogs() {
    const startTime = Date.now();
    logger.info('[LOG SCHEDULER] Starting log check...');

    try {
      const activeContracts = await database.getActiveContracts();
      logger.info(`[LOG SCHEDULER] Found ${activeContracts.length} active contracts`);

      if (activeContracts.length === 0) {
        logger.info('[LOG SCHEDULER] No active contracts to monitor');
        return;
      }

      // Process each contract
      for (const contract of activeContracts) {
        await this.processContractLogs(contract);
      }

      const duration = Date.now() - startTime;
      logger.info(`[LOG SCHEDULER] Log check completed in ${duration}ms`);
    } catch (error) {
      logger.error(`[LOG SCHEDULER] Error checking logs: ${error.message}`);
    }
  }

  /**
   * Process logs for a specific contract
   * @param {Object} contract - The contract to process
   */
  async processContractLogs(contract) {
    const startTime = Date.now();
    logger.info(`[LOG SCHEDULER] Processing contract ${contract.id} (${contract.contract_type})`);

    try {
      // Get the buyer's user record
      const buyer = await database.getUserByTornId(contract.buyer_target);
      if (!buyer || !buyer.api_key) {
        logger.warn(`[LOG SCHEDULER] No API key found for buyer ${contract.buyer_target}`);
        return;
      }

      // Decrypt the API key
      let apiKey;
      try {
        apiKey = cryptoHelper.decrypt(buyer.api_key);
      } catch (error) {
        logger.error(`[LOG SCHEDULER] Failed to decrypt API key for user ${buyer.discord_id}: ${error.message}`);
        return;
      }

      // Get logs from Torn API
      const logs = await this.fetchTornLogs(apiKey);
      if (!logs || !logs.length) {
        logger.debug(`[LOG SCHEDULER] No new logs for contract ${contract.id}`);
        return;
      }

      logger.info(`[LOG SCHEDULER] Found ${logs.length} logs for contract ${contract.id}`);

      // Process each log
      for (const log of logs) {
        await this.processLogEntry(contract, log);
      }

      const duration = Date.now() - startTime;
      logger.info(`[LOG SCHEDULER] Processed contract ${contract.id} in ${duration}ms`);
    } catch (error) {
      logger.error(`[LOG SCHEDULER] Error processing contract ${contract.id}: ${error.message}`);
    }
  }

  /**
   * Fetch logs from Torn API
   * @param {string} apiKey - The decrypted API key
   * @returns {Array} Array of log entries
   */
  async fetchTornLogs(apiKey) {
    const logSelection = tornLogMap.getLogSelectionString();
    const url = `${config.tornApiUrl}/user/?key=${apiKey}&log=${logSelection}&selections=log`;

    try {
      logger.debug(`[LOG SCHEDULER] Fetching logs: ${url.replace(/key=\w+/, 'key=XXXXX')}`);

      const response = await axios.get(url, {
        timeout: 10000
      });

      if (!response.data || !response.data.logs) {
        logger.warn('[LOG SCHEDULER] No logs data in response');
        return [];
      }

      return response.data.logs;
    } catch (error) {
      logger.error(`[LOG SCHEDULER] Failed to fetch logs: ${error.message}`);

      if (error.response) {
        const status = error.response.status;
        logger.error(`[LOG SCHEDULER] API Error: ${status} - ${JSON.stringify(error.response.data)}`);

        // Handle rate limiting
        if (status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 30;
          logger.warn(`[LOG SCHEDULER] Rate limited. Retrying after ${retryAfter} seconds`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.fetchTornLogs(apiKey); // Retry once
        }
      }

      return [];
    }
  }

  /**
   * Process a single log entry
   * @param {Object} contract - The contract
   * @param {Array} logEntry - The log entry from Torn API
   */
  async processLogEntry(contract, logEntry) {
    const logId = logEntry[0].toString();
    const timestamp = logEntry[2];

    // Check if this log has already been processed
    if (await database.hasLogBeenProcessed(contract.id, logId, timestamp)) {
      return;
    }

    // Parse the log entry
    const parsedLog = tornLogMap.parseLogEntry(logEntry);
    if (!parsedLog) {
      return;
    }

    // Mark as processed before sending to avoid duplicates
    await database.markLogAsProcessed(contract.id, logId, timestamp);

    // Find the ticket channel for this contract
    const ticket = await this.findTicketChannelForContract(contract);
    if (!ticket) {
      logger.warn(`[LOG SCHEDULER] No ticket channel found for contract ${contract.id}`);
      return;
    }

    // Send the log update to the channel
    await this.sendLogUpdate(ticket.channel_id, parsedLog);
  }

  /**
   * Find the ticket channel for a contract
   * @param {Object} contract - The contract
   * @returns {Object|null} Ticket object with channel_id
   */
  async findTicketChannelForContract(contract) {
    // Try to find ticket by buyer target (torn_id)
    let ticket = await database.getUserByTornId(contract.buyer_target);
    if (ticket) {
      const userTicket = await database.getTicketByChannelId(ticket.channel_id);
      if (userTicket) return userTicket;
    }

    // Try to find any ticket with this buyer_id
    const stmt = database.db.prepare(`
      SELECT * FROM tickets
      WHERE buyer_id = ?
      LIMIT 1
    `);
    return stmt.get(contract.buyer_target);
  }

  /**
   * Send log update to Discord channel
   * @param {string} channelId - The Discord channel ID
   * @param {Object} parsedLog - The parsed log data
   */
  async sendLogUpdate(channelId, parsedLog) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        logger.error(`[LOG SCHEDULER] Invalid channel: ${channelId}`);
        return;
      }

      // Format the message based on log category
      let message = parsedLog.message;

      // For loss logs, add special formatting
      if (tornLogMap.isLossLog(parsedLog.logId)) {
        message = `⚔️ **Log Update:** ${parsedLog.details.attacker} attacked ${parsedLog.details.defender} and lost.`;
      }

      await channel.send(message);
      logger.info(`[LOG SCHEDULER] Sent log update to channel ${channelId}: ${message}`);
    } catch (error) {
      logger.error(`[LOG SCHEDULER] Failed to send log update to channel ${channelId}: ${error.message}`);
    }
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRunTimes
    };
  }
}

module.exports = LogScheduler;