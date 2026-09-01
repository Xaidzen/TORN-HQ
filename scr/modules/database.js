const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, '../../database/losses-bot.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

function initializeDatabase() {
  logger.info('Initializing database...');

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      torn_id INTEGER NOT NULL,
      torn_name TEXT NOT NULL,
      api_key TEXT,
      verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add api_key column if it doesn't exist (for migration purposes)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN api_key TEXT`);
    logger.info('Added missing api_key column to users table');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      logger.info('api_key column already exists in users table');
    } else {
      logger.error(`Error adding api_key column: ${error.message}`);
    }
  }

  // Create tickets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      buyer_id TEXT,
      target_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      budget TEXT,
      channel_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(discord_id)
    )
  `);

  // Create verification sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_sessions (
      user_id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(discord_id)
    )
  `);

  // Create claims table
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      service_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(discord_id)
    )
  `);

  // Create contracts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      remaining_amount INTEGER NOT NULL,
      buyer_target TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES users(discord_id)
    )
  `);

  // Create processed logs table to track processed log entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      log_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(contract_id, log_id, timestamp),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    )
  `);

  logger.info('Database initialized successfully');
}

function saveUser(discordId, tornId, tornName, apiKey = null) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users (discord_id, torn_id, torn_name, api_key, last_activity)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const result = stmt.run(discordId, tornId, tornName, apiKey);
  logger.info(`Database: Saved user ${discordId} -> Torn: ${tornId} (${tornName})`);
  return result;
}

function updateUserApiKey(discordId, encryptedApiKey) {
  const stmt = db.prepare(`
    UPDATE users
    SET api_key = ?
    WHERE discord_id = ?
  `);
  const result = stmt.run(encryptedApiKey, discordId);
  logger.info(`Database: Updated API key for user ${discordId}`);
  return result.changes;
}

function getUser(discordId) {
  const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
  return stmt.get(discordId);
}

function startVerificationSession(userId, expiresAt) {
  logger.info(`[DEBUG DB] startVerificationSession called with userId: ${userId}, expiresAt: ${expiresAt}, type: ${typeof userId}`);

  // Ensure user exists in users table before creating verification session
  const userCheck = db.prepare('SELECT discord_id FROM users WHERE discord_id = ?');
  const existingUser = userCheck.get(userId);

  if (!existingUser) {
    // Create minimal user record if it doesn't exist
    const insertUser = db.prepare(`
      INSERT INTO users (discord_id, torn_id, torn_name, verified_at, last_activity)
      VALUES (?, 0, 'Unverified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    insertUser.run(userId);
    logger.info(`Database: Created minimal user record for ${userId}`);
  }

  // Create verification session
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO verification_sessions (user_id, expires_at)
    VALUES (?, ?)
  `);
  stmt.run(userId, expiresAt);
  logger.info(`Database: Started verification session for ${userId} (expires ${expiresAt})`);

  // Debug: Log what was just inserted
  const debugStmt = db.prepare('SELECT * FROM verification_sessions WHERE user_id = ?');
  const inserted = debugStmt.get(userId);
  logger.info(`[DEBUG] Just inserted session: ${JSON.stringify(inserted)}`);
}

function endVerificationSession(userId) {
  const stmt = db.prepare('DELETE FROM verification_sessions WHERE user_id = ?');
  stmt.run(userId);
  logger.info(`Database: Ended verification session for ${userId}`);

  // Debug: Log table contents after deletion
  const debugStmt = db.prepare('SELECT * FROM verification_sessions');
  const allSessions = debugStmt.all();
  logger.info(`[DEBUG] All sessions after deletion: ${JSON.stringify(allSessions)}`);
}

function hasActiveVerification(userId) {
  const now = Date.now();
  logger.info(`[DEBUG] Checking verification for user: ${userId}, current time: ${now}`);

  const stmt = db.prepare('SELECT 1 FROM verification_sessions WHERE user_id = ? AND expires_at > ?');
  const result = stmt.get(userId, now);

  // Debug: Log all sessions for this user
  const debugStmt = db.prepare('SELECT * FROM verification_sessions WHERE user_id = ?');
  const userSessions = debugStmt.all(userId);
  logger.info(`[DEBUG] All sessions for user ${userId}: ${JSON.stringify(userSessions)}`);

  return !!result;
}

function createTicket(userId, buyerId, targetId, quantity, budget, channelId) {
  const stmt = db.prepare(`
    INSERT INTO tickets (user_id, buyer_id, target_id, quantity, budget, channel_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  const result = stmt.run(userId, buyerId, targetId, quantity, budget, channelId);
  logger.info(`Database: Created ticket ${result.lastInsertRowid} for user ${userId}`);
  return result.lastInsertRowid;
}

function createClaim(userId, serviceType, amount) {
  const stmt = db.prepare(`
    INSERT INTO claims (user_id, service_type, amount, status)
    VALUES (?, ?, ?, 'pending')
  `);
  const result = stmt.run(userId, serviceType, amount);
  logger.info(`Database: Created claim ${result.lastInsertRowid} for user ${userId} (${serviceType}: ${amount})`);
  return result.lastInsertRowid;
}

function getActiveContract(serviceType) {
  const stmt = db.prepare(`
    SELECT * FROM contracts
    WHERE contract_type = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(serviceType);
}

function getActiveContracts() {
  const stmt = db.prepare(`
    SELECT * FROM contracts
    WHERE status = 'active'
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

function getContractById(contractId) {
  const stmt = db.prepare('SELECT * FROM contracts WHERE id = ?');
  return stmt.get(contractId);
}

function getUserByTornId(tornId) {
  const stmt = db.prepare('SELECT * FROM users WHERE torn_id = ?');
  return stmt.get(tornId);
}

function getAllUsersWithApiKeys() {
  const stmt = db.prepare('SELECT discord_id, torn_id, torn_name, api_key FROM users WHERE api_key IS NOT NULL');
  return stmt.all();
}

function getTicketByChannelId(channelId) {
  const stmt = db.prepare('SELECT * FROM tickets WHERE channel_id = ?');
  return stmt.get(channelId);
}

function hasLogBeenProcessed(contractId, logId, timestamp) {
  const stmt = db.prepare(`
    SELECT 1 FROM processed_logs
    WHERE contract_id = ? AND log_id = ? AND timestamp = ?
  `);
  return !!stmt.get(contractId, logId, timestamp);
}

function markLogAsProcessed(contractId, logId, timestamp) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO processed_logs (contract_id, log_id, timestamp)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(contractId, logId, timestamp);
  return result.changes > 0;
}

function createContract(staffId, contractType, totalAmount, buyerTarget) {
  const stmt = db.prepare(`
    INSERT INTO contracts (staff_id, contract_type, total_amount, remaining_amount, buyer_target, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);
  const result = stmt.run(staffId, contractType, totalAmount, totalAmount, buyerTarget);
  logger.info(`Database: Created contract ${result.lastInsertRowid} by ${staffId} (${contractType}: ${totalAmount})`);
  return result.lastInsertRowid;
}

function updateContractRemainingAmount(contractId, remainingAmount) {
  const stmt = db.prepare(`
    UPDATE contracts
    SET remaining_amount = ?
    WHERE id = ?
  `);
  const result = stmt.run(remainingAmount, contractId);
  logger.info(`Database: Updated contract ${contractId} remaining amount to ${remainingAmount}`);
  return result.changes;
}

function updateContractStatus(contractId, status) {
  const stmt = db.prepare(`
    UPDATE contracts
    SET status = ?
    WHERE id = ?
  `);
  const result = stmt.run(status, contractId);
  logger.info(`Database: Updated contract ${contractId} status to ${status}`);
  return result.changes;
}

module.exports = {
  initializeDatabase,
  saveUser,
  getUser,
  updateUserApiKey,
  startVerificationSession,
  endVerificationSession,
  hasActiveVerification,
  createTicket,
  createClaim,
  getActiveContract,
  getActiveContracts,
  getContractById,
  getUserByTornId,
  getTicketByChannelId,
  getAllUsersWithApiKeys,
  hasLogBeenProcessed,
  markLogAsProcessed,
  createContract,
  updateContractRemainingAmount,
  updateContractStatus
};
