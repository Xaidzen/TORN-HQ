const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');
const config = require('./config');

/**
 * Encrypts text using AES-256-CBC
 * @param {string} text - The text to encrypt
 * @returns {string} Encrypted text (iv:encrypted)
 */
function encrypt(text) {
	if (!text) return null;

	const secretKey = process.env.CRYPTO_SECRET_KEY;
	if (!secretKey || secretKey.length < 32) {
		throw new Error('CRYPTO_SECRET_KEY must be at least 32 characters long');
	}

	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey.substring(0, 32)), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts text using AES-256-CBC
 * @param {string} encryptedText - The encrypted text (iv:encrypted)
 * @returns {string} Decrypted text
 */
function decrypt(encryptedText) {
	if (!encryptedText) return null;

	const secretKey = process.env.CRYPTO_SECRET_KEY;
	if (!secretKey || secretKey.length < 32) {
		throw new Error('CRYPTO_SECRET_KEY must be at least 32 characters long');
	}

	const parts = encryptedText.split(':');
	if (parts.length !== 2) {
		throw new Error('Invalid encrypted text format');
	}

	const iv = Buffer.from(parts[0], 'hex');
	const encrypted = Buffer.from(parts[1], 'hex');
	const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey.substring(0, 32)), iv);
	let decrypted = decipher.update(encrypted);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
}

/**
 * Validates a Torn API key
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<Object>} Validation result with access_level, access_type, and selections
 * @throws {Error} If validation fails
 */
async function validateApiKey(apiKey) {
	if (!apiKey || typeof apiKey !== 'string') {
		throw new Error('API key is required');
	}

	try {
		const url = `${config.tornApiUrl}key/?key=${apiKey}&selections=info`;
		logger.debug(`[API] Validating key: ${url.replace(/key=\w+/, 'key=XXXXX')}`);

		const response = await axios.get(url);
		const data = response.data;

		if (!data || typeof data.access_level === 'undefined') {
			throw new Error('Invalid API key response format');
		}

		const { access_level, access_type, selections } = data;

		// Check if it's a Full Access key
		if (access_level === 4 && access_type === 'Full Access') {
			logger.info(`[API] API key validated successfully (level: ${access_level}, type: ${access_type})`);
			return { access_level, access_type, selections };
		}

		// Check if it's a Custom key with required permissions
		if (access_level === 0 && access_type === 'Custom') {
			if (!selections || typeof selections !== 'object') {
				throw new Error('Custom key missing selections');
			}

			// Required selections for our bot
			const requiredSelections = {
				user: ['attacks'],
				company: ['profile', 'companies', 'detailed', 'employees', 'news']
			};

			// Check if all required selections are present
			for (const [category, requiredItems] of Object.entries(requiredSelections)) {
				if (!selections[category]) {
					throw new Error(`Custom key missing required category: ${category}`);
				}

				for (const item of requiredItems) {
					if (!selections[category].includes(item)) {
						throw new Error(`Custom key missing required selection: ${category}.${item}`);
					}
				}
			}

			logger.info(`[API] Custom API key validated successfully (level: ${access_level}, type: ${access_type})`);
			return { access_level, access_type, selections };
		}

		// If we get here, the key doesn't meet our requirements
		throw new Error(`Invalid key type. Access level: ${access_level}, Type: ${access_type}`);
	} catch (error) {
		logger.error(`[API] API key validation failed: ${error.message}`);
		if (error.response) {
			logger.error(`[API] Status: ${error.response.status}`);
			logger.error(`[API] Response: ${JSON.stringify(error.response.data)}`);
		}
		throw new Error(`API key validation failed: ${error.message}`);
	}
}

module.exports = {
	encrypt,
	decrypt,
	validateApiKey
};