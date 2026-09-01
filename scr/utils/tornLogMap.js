const logger = require('./logger');

/**
 * Torn API Log Type Definitions
 * Maps log IDs to human-readable names and message templates
 */
const LOG_TYPES = {
  '8100': {
    name: 'Attack lost',
    category: 'loss',
    messageTemplate: '⚔️ **Log Update:** {attacker} attacked {defender} and lost.',
    parsePattern: /([^ ]+) attacked ([^ ]+)/
  },
  '8101': {
    name: 'Attack lost receive',
    category: 'loss',
    messageTemplate: '⚔️ **Log Update:** {attacker} attacked {defender} and lost.',
    parsePattern: /([^ ]+) attacked ([^ ]+)/
  },
  '8105': {
    name: 'Attack stalemate',
    category: 'other',
    messageTemplate: '⚔️ **Stalemate:** {attacker} and {defender} fought to a stalemate.'
  },
  '8106': {
    name: 'Attack stalemate receive',
    category: 'other',
    messageTemplate: '⚔️ **Stalemate:** {attacker} and {defender} fought to a stalemate.'
  },
  '8110': {
    name: 'Attack timeout',
    category: 'other',
    messageTemplate: '⏰ **Timeout:** {attacker} timed out against {defender}.'
  },
  '8111': {
    name: 'Attack timeout receive',
    category: 'other',
    messageTemplate: '⏰ **Timeout:** {attacker} timed out against {defender}.'
  },
  '8115': {
    name: 'Attack escape',
    category: 'other',
    messageTemplate: '🏃 **Escape:** {attacker} escaped from {defender}.'
  },
  '8116': {
    name: 'Attack escape receive',
    category: 'other',
    messageTemplate: '🏃 **Escape:** {attacker} escaped from {defender}.'
  },
  '8140': {
    name: 'Attack failed',
    category: 'other',
    messageTemplate: '❌ **Failed Attack:** {attacker} failed to attack {defender}.'
  },
  '8141': {
    name: 'Attack failed receive',
    category: 'other',
    messageTemplate: '❌ **Failed Attack:** {attacker} failed to attack {defender}.'
  },
  '8145': {
    name: 'Attack assist',
    category: 'other',
    messageTemplate: '🤝 **Assist:** {attacker} assisted in attacking {defender}.'
  },
  '8150': {
    name: 'Attack leave',
    category: 'other',
    messageTemplate: '🚪 **Left Attack:** {attacker} left the attack on {defender}.'
  },
  '8151': {
    name: 'Attack leave receive',
    category: 'other',
    messageTemplate: '🚪 **Left Attack:** {attacker} left the attack on {defender}.'
  },
  '8155': {
    name: 'Attack mug',
    category: 'other',
    messageTemplate: '💰 **Mug:** {attacker} mugged {defender} for {amount}.'
  },
  '8156': {
    name: 'Attack mug receive',
    category: 'other',
    messageTemplate: '💰 **Mug:** {attacker} mugged {defender} for {amount}.'
  },
  '8160': {
    name: 'Attack hospitalize',
    category: 'other',
    messageTemplate: '🏥 **Hospitalization:** {attacker} hospitalized {defender}.'
  },
  '8161': {
    name: 'Attack hospitalize receive',
    category: 'other',
    messageTemplate: '🏥 **Hospitalization:** {attacker} hospitalized {defender}.'
  },
  '8165': {
    name: 'Attack arrest',
    category: 'other',
    messageTemplate: '👮 **Arrest:** {attacker} arrested {defender}.'
  },
  '8166': {
    name: 'Attack arrest receive',
    category: 'other',
    messageTemplate: '👮 **Arrest:** {attacker} arrested {defender}.'
  },
  '6403': {
    name: 'Job special spy',
    category: 'spy',
    messageTemplate: '🔍 **Spy Report:** {attacker} completed a spy job on {target}.'
  }
};

/**
 * Get all log IDs as a comma-separated string for API queries
 * @returns {string} Comma-separated log IDs
 */
function getLogSelectionString() {
  return Object.keys(LOG_TYPES).join(',');
}

/**
 * Get log type by ID
 * @param {string} logId - The log ID
 * @returns {Object|null} Log type definition or null if not found
 */
function getLogType(logId) {
  return LOG_TYPES[logId] || null;
}

/**
 * Parse log entry and extract relevant information
 * @param {Object} logEntry - The log entry from Torn API
 * @returns {Object} Parsed log data with message and details
 */
function parseLogEntry(logEntry) {
  const logId = logEntry[0].toString();
  const logType = getLogType(logId);

  if (!logType) {
    logger.warn(`[LOG] Unknown log type: ${logId}`);
    return null;
  }

  const logData = logEntry[1];
  const timestamp = logEntry[2];
  const logText = logData[0] || '';

  let message = logType.messageTemplate;
  let details = {
    logId,
    timestamp,
    logText,
    category: logType.category
  };

  // Parse attacker and defender for loss logs
  if (logType.category === 'loss' && logType.parsePattern) {
    const match = logText.match(logType.parsePattern);
    if (match) {
      details.attacker = match[1];
      details.defender = match[2];
      message = message.replace('{attacker}', details.attacker)
                      .replace('{defender}', details.defender);
    }
  }
  // Parse mug amount
  else if (logId === '8155' || logId === '8156') {
    const amountMatch = logText.match(/for (\d+)/);
    if (amountMatch) {
      details.amount = amountMatch[1];
      message = message.replace('{amount}', details.amount);
    }
  }
  // Parse general attacker/defender for other logs
  else {
    const attackerMatch = logText.match(/([^ ]+) attacked ([^ ]+)/);
    if (attackerMatch) {
      details.attacker = attackerMatch[1];
      details.defender = attackerMatch[2];
      message = message.replace('{attacker}', details.attacker)
                      .replace('{defender}', details.defender);
    } else {
      // Fallback: use the full log text
      details.attacker = 'Unknown';
      details.defender = 'Unknown';
    }
  }

  return {
    message,
    details,
    logId,
    timestamp
  };
}

/**
 * Check if log is a loss category
 * @param {string} logId - The log ID
 * @returns {boolean} True if it's a loss log
 */
function isLossLog(logId) {
  const logType = getLogType(logId);
  return logType && logType.category === 'loss';
}

module.exports = {
  LOG_TYPES,
  getLogSelectionString,
  getLogType,
  parseLogEntry,
  isLossLog
};