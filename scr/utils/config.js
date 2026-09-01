require('dotenv').config();

const config = {
  discordToken: process.env.DISCORD_TOKEN,
  tornApiUrl: process.env.TORN_API_URL || 'https://api.torn.com',
  adminRoleId: process.env.ADMIN_ROLE_ID,
  staffRoleId: process.env.STAFF_ROLE_ID,
  verifiedRoleId: process.env.VERIFIED_ROLE_ID,
  orderingChannelId: process.env.ORDERING_CHANNEL_ID,
  ticketsCategoryId: process.env.TICKETS_CATEGORY_ID,
  targetGuildId: process.env.TARGET_GUILD_ID,
  verificationTimeout: parseInt(process.env.VERIFICATION_TIMEOUT) || 600000
};

module.exports = config;
