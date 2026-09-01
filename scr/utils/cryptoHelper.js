const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');
const config = require('./config');

/**
 * Encrypts text using AES-256-CBC
 * @param {string} text
 * @returns {string} Encrypted text (iv:encrypted)
 */
function encrypt(text) {
	if (!text) return null;

	const secretKey = process.env.CRYPTO_SECRET_KEY;
	if (!secretKey || secretKey.length < 32) {
		throw new Error('CRYPTO_SECRET_KEY must be at least 32 characters long');
	}

	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(
		'aes-256-cbc',
		Buffer.from(secretKey.substring(0, 32)),
		iv
	);

	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts text using AES-256-CBC
 * @param {string} encryptedText
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

	const decipher = crypto.createDecipheriv(
		'aes-256-cbc',
		Buffer.from(secretKey.substring(0, 32)),
		iv
	);

	let decrypted = decipher.update(encrypted);
	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString();
}

/**
 * Validates a Torn API key.
 *
 * The key itself is validated by Torn.
 * We do NOT try to determine whether the key is Full Access
 * or Custom based on assumptions about access_level.
 *
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
async function validateApiKey(apiKey) {
	if (!apiKey || typeof apiKey !== 'string') {
		throw new Error('API key is required');
	}

	apiKey = apiKey.trim();

	/*
	 * Torn API keys are normally 16 characters.
	 * Do not reject the key based on access type here.
	 */
	if (!/^[a-zA-Z0-9]{16}$/.test(apiKey)) {
		throw new Error('Invalid API key format');
	}

	try {
		const baseUrl = config.tornApiUrl || 'https://api.torn.com/';

		const url =
			`${baseUrl}key/?key=${encodeURIComponent(apiKey)}` +
			`&selections=info`;

		logger.debug(
			`[API] Validating key: ${url.replace(
				/key=[^&]+/,
				'key=XXXXX'
			)}`
		);

		const response = await axios.get(url, {
			timeout: 15000
		});

		const data = response.data;

		/*
		 * Torn returned an API error.
		 */
		if (data && data.error) {
			throw new Error(
				data.error.error ||
				'Torn rejected the API key'
			);
		}

		/*
		 * Make sure Torn actually returned key information.
		 */
		if (!data || typeof data !== 'object') {
			throw new Error('Invalid API response');
		}

		/*
		 * The important part:
		 *
		 * We accept the key if Torn successfully returns
		 * information about it.
		 *
		 * We no longer force:
		 * access_level === 4
		 * access_type === "Full Access"
		 *
		 * or:
		 * access_level === 0
		 * access_type === "Custom"
		 */
		const access_level = data.access_level;
		const access_type = data.access_type;
		const selections = data.selections || {};

		logger.info(
			`[API] API key validated successfully` +
			` (level: ${access_level ?? 'unknown'},` +
			` type: ${access_type ?? 'unknown'})`
		);

		return {
			access_level,
			access_type,
			selections,
			valid: true
		};

	} catch (error) {
		logger.error(
			`[API] API key validation failed: ${error.message}`
		);

		if (error.response) {
			logger.error(
				`[API] Status: ${error.response.status}`
			);

			logger.error(
				`[API] Response: ${JSON.stringify(error.response.data)}`
			);
		}

		throw new Error(
			`API key validation failed: ${error.message}`
		);
	}
}

module.exports = {
	encrypt,
	decrypt,
	validateApiKey
};
