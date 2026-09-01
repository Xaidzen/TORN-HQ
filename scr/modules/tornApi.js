const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');

class TornApi {
  constructor() {
    this.baseUrl = config.tornApiUrl;
  }

  async getDiscordIdentity(apiKey) {
    const url = `${this.baseUrl}/v2/user/discord?key=${apiKey}`;
    logger.debug(`[API] Request: ${url.replace(/key=\w+/, 'key=XXXXX')}`);

    try {
      const response = await axios.get(url);
      logger.debug(`[API] Response: ${JSON.stringify(response.data)}`);
      return {
        status: response.status,
        data: response.data
      };
    } catch (error) {
      logger.error(`[API] Discord identity check failed: ${error.message}`);
      if (error.response) {
        logger.error(`[API] Status: ${error.response.status}`);
        logger.error(`[API] Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getProfile(apiKey) {
    const url = `${this.baseUrl}/v2/user/profile?key=${apiKey}`;
    logger.debug(`[API] Request: ${url.replace(/key=\w+/, 'key=XXXXX')}`);

    try {
      const response = await axios.get(url);
      logger.debug(`[API] Response: ${JSON.stringify(response.data)}`);
      return {
        status: response.status,
        data: response.data
      };
    } catch (error) {
      logger.error(`[API] Profile fetch failed: ${error.message}`);
      if (error.response) {
        logger.error(`[API] Status: ${error.response.status}`);
        logger.error(`[API] Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}

module.exports = new TornApi();