const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const https = require('https');
const { setTimeout } = require('timers/promises');

const ADMIN_ID = 7308292609;
const BOT_TOKEN = "8533662019:AAHKsMxXgYH9NmJOwCAwfK-TGsAqi0m-TiM";
const IGNORE_SSL = true;
const WIN_LOSE_CHECK_INTERVAL = 1000;
const MAX_RESULT_WAIT_TIME = 60000;

// ⚡ BALANCE CHECK SETTINGS - IMPROVED
const MAX_BALANCE_RETRIES = 20;
const BALANCE_RETRY_DELAY = 1500;
const BALANCE_API_TIMEOUT = 20000;
const BET_API_TIMEOUT = 29000;
const MAX_BET_RETRIES = 3;
const BET_RETRY_DELAY = 1000;
const MAX_CONSECUTIVE_ERRORS = 15;
const MESSAGE_RATE_LIMIT_SECONDS = 10;
const MAX_TELEGRAM_RETRIES = 3;
const TELEGRAM_RETRY_DELAY = 1000;

// ⚡ FAST MODE SETTINGS - IMPROVED
const FAST_MODE = true;
const QUICK_BALANCE_CHECK = true;
const SKIP_TELEGRAM_CONFIRMATION = false;

// ⚡ Game type အလိုက် မတူတဲ့ delay
const GAME_DELAYS = {
  'TRX': 3000,
  'WINGO30S': 300,
  'WINGO1MIN': 500,
  'WINGO3MIN': 1000,
  'WINGO5MIN': 2000
};

const PLATFORM_CONFIGS = {
  '777BIGWIN': {
    BASE_URL: "https://api.bigwinqaz.com/api/webapi/",
    ALLOWED_USERS_FILE: 'users_777bigwin.json',
    USER_SET_KEY: 'allowed777bigwinIds',
    GAME_NAME: "🎰 777 BIGWIN",
    LOGIN_PREFIX: "95"
  },
  'CKLOTTERY': {
    BASE_URL: "https://ckygjf6r.com/api/webapi/",
    ALLOWED_USERS_FILE: 'users_cklottery.json',
    USER_SET_KEY: 'allowedcklotteryIds',
    GAME_NAME: "🎲 CK LOTTERY",
    LOGIN_PREFIX: "95"
  },
  '6LOTTERY': {
    BASE_URL: "https://6lotteryapi.com/api/webapi/",
    ALLOWED_USERS_FILE: 'users_6lottery.json',
    USER_SET_KEY: 'allowed6lotteryIds',
    GAME_NAME: "🎯 6 LOTTERY",
    LOGIN_PREFIX: "95"
  }
};

// System Mode - FREE or PREMIUM
const SYSTEM_MODE_FILE = 'system_mode.json';
let SYSTEM_MODE = 'FREE';

// User Management
const BANNED_USERS_FILE = 'banned_users.json';
let bannedUsers = new Set();

// Time Settings Storage (Updated to TIME START system)
const TIME_START_FILE = 'time_start_settings.json';
const userTimeStarts = {};

// Channel Configuration
const CHANNEL_CONFIG_FILE = 'channel_config.json';
let requiredChannels = [
  { id: "@KMM_MOD1", name: "🚀 𝐌'_𝐌𝐎𝐃 𝐂𝐡𝐚𝐧𝐧𝐞𝐥 🚀" },
  { id: "@Sketchware_Beginner_Developer", name: "Sketchware Beginner Developer" }
];

// Load system mode
const loadSystemMode = async () => {
  try {
    const data = await fs.readFile(SYSTEM_MODE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    SYSTEM_MODE = parsed.mode || 'FREE';
    log('INFO', `📊 System Mode Loaded: ${SYSTEM_MODE} MODE`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('WARNING', `${SYSTEM_MODE_FILE} not found. Starting in FREE MODE`);
      SYSTEM_MODE = 'FREE';
      await saveSystemMode('FREE');
    } else {
      log('ERROR', `🧨 ERROR loading system mode: ${error.message}`);
      SYSTEM_MODE = 'FREE';
    }
  }
};

// Save system mode
const saveSystemMode = async (mode) => {
  try {
    SYSTEM_MODE = mode;
    await fs.writeFile(
      SYSTEM_MODE_FILE,
      JSON.stringify({ mode: SYSTEM_MODE }, null, 2)
    );
    log('INFO', `💾 System Mode Saved: ${SYSTEM_MODE} MODE`);
  } catch (error) {
    log('ERROR', `🧨 ERROR saving system mode: ${error.message}`);
  }
};

// Load banned users
const loadBannedUsers = async () => {
  try {
    const data = await fs.readFile(BANNED_USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    bannedUsers = new Set(parsed.banned_ids || []);
    log('INFO', `📂 Loaded ${bannedUsers.size} banned users`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('WARNING', `${BANNED_USERS_FILE} not found. Starting fresh`);
      bannedUsers = new Set();
      await saveBannedUsers();
    } else {
      log('ERROR', `🧨 ERROR loading ${BANNED_USERS_FILE}: ${error.message}`);
      bannedUsers = new Set();
    }
  }
};

// Save banned users
const saveBannedUsers = async () => {
  try {
    await fs.writeFile(
      BANNED_USERS_FILE,
      JSON.stringify({ banned_ids: Array.from(bannedUsers) }, null, 2)
    );
    log('INFO', `💾 Saved ${bannedUsers.size} banned users`);
  } catch (error) {
    log('ERROR', `🧨 ERROR saving banned users: ${error.message}`);
  }
};

// Load time start settings
const loadTimeStartSettings = async () => {
  try {
    const data = await fs.readFile(TIME_START_FILE, 'utf8');
    const parsed = JSON.parse(data);
    for (const [userId, starts] of Object.entries(parsed)) {
      userTimeStarts[userId] = starts;
    }
    log('INFO', `📂 Loaded time start settings for ${Object.keys(userTimeStarts).length} users`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('WARNING', `${TIME_START_FILE} not found. Starting fresh`);
      await saveTimeStartSettings();
    } else {
      log('ERROR', `🧨 ERROR loading time start settings: ${error.message}`);
    }
  }
};

// Save time start settings
const saveTimeStartSettings = async () => {
  try {
    await fs.writeFile(
      TIME_START_FILE,
      JSON.stringify(userTimeStarts, null, 2)
    );
    log('INFO', `💾 Saved time start settings for ${Object.keys(userTimeStarts).length} users`);
  } catch (error) {
    log('ERROR', `🧨 ERROR saving time start settings: ${error.message}`);
  }
};

// Load channel config
const loadChannelConfig = async () => {
  try {
    const data = await fs.readFile(CHANNEL_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    requiredChannels = parsed.channels || requiredChannels;
    log('INFO', `📢 Loaded ${requiredChannels.length} required channels from config`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('WARNING', `${CHANNEL_CONFIG_FILE} not found. Using default channels`);
      await saveChannelConfig();
    } else {
      log('ERROR', `🧨 ERROR loading channel config: ${error.message}`);
    }
  }
};

// Save channel config
const saveChannelConfig = async () => {
  try {
    await fs.writeFile(
      CHANNEL_CONFIG_FILE,
      JSON.stringify({ channels: requiredChannels }, null, 2)
    );
    log('INFO', `💾 Saved ${requiredChannels.length} channels to config`);
  } catch (error) {
    log('ERROR', `🧨 ERROR saving channel config: ${error.message}`);
  }
};

// Ban user
const banUser = async (userId, username = '') => {
  bannedUsers.add(userId);
  await saveBannedUsers();
  
  if (userSettings[userId]?.running) {
    userSettings[userId].running = false;
    if (userSettings[userId].task) {
      if (typeof userSettings[userId].task === 'object' && typeof userSettings[userId].task.cancel === 'function') {
        userSettings[userId].task.cancel();
      }
      userSettings[userId].task = null;
    }
  }
  
  log('INFO', `🚫 User ${userId} (${username}) has been banned`);
};

// Unban user
const unbanUser = async (userId) => {
  bannedUsers.delete(userId);
  await saveBannedUsers();
  log('INFO', `🎄User ${userId} has been unbanned`);
};

// Check if user is banned
const isUserBanned = (userId) => {
  return bannedUsers.has(userId);
};

// Get user statistics
const getUserStatistics = () => {
  const totalUsers = Object.keys(userSessions).length;
  const activeUsers = Object.values(userSettings).filter(s => s.running).length;
  const bannedCount = bannedUsers.size;
  const inactiveUsers = totalUsers - activeUsers;
  
  return {
    totalUsers,
    activeUsers,
    bannedUsers: bannedCount,
    inactiveUsers
  };
};

// User data structures
const userState = {};
const userTemp = {};
const userSessions = {};
const userSettings = {};
const userPendingBets = {};
const userWaitingForResult = {};
const userStats = {};
const userGameInfo = {};
const userLastResult = {};
const userResultHistory = {};
const userSkippedBets = {};
const userShouldSkipNext = {};
const userBalanceWarnings = {};
const userSkipResultWait = {};
const userSLSkipWaitingForWin = {};
const userStopInitiated = {};
const userCommandLocks = {};

// Silent Mode အတွက်
const userSilentMode = {};
const userProfitMessageId = {};
const userLastProfit = {};

// Session refresh tracking
const userSessionRefreshCount = {};
const userLastSessionRefresh = {};

// Platform-specific allowed user sets
let allowed777bigwinIds = new Set();
let allowedcklotteryIds = new Set();
let allowed6lotteryIds = new Set();
let nextBetTime = null;
let nextBetIssue = null;
let streakBetCount = 0;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const httpsAgent = new https.Agent({
  rejectUnauthorized: !IGNORE_SSL,
  keepAlive: true,
  maxSockets: 50,
  timeout: 30000
});

const log = (level, message) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} - ${level} - ${message}`);
};

// ============================================
// NEW: SESSION MANAGEMENT FUNCTIONS
// ============================================

const refreshUserSession = async (userId) => {
  try {
    const settings = userSettings[userId];
    const platform = settings?.platform;
    const temp = userTemp[userId];
    
    if (!platform || !temp || !temp.password) {
      log('ERROR', `❌ Cannot refresh session for ${userId}: Missing credentials`);
      return null;
    }
    
    const username = userGameInfo[userId]?.username?.replace(PLATFORM_CONFIGS[platform].LOGIN_PREFIX, "") || "";
    if (!username) {
      log('ERROR', `❌ Cannot refresh session for ${userId}: Missing username`);
      return null;
    }
    
    // Check if we refreshed recently (within 1 minute)
    const lastRefresh = userLastSessionRefresh[userId] || 0;
    const now = Date.now();
    if (now - lastRefresh < 60000) {
      log('WARNING', `⚠️ Session refreshed recently for ${userId}, skipping`);
      return userSessions[userId];
    }
    
    log('INFO', `🔄 Attempting to refresh session for user ${userId} (${platform})`);
    
    const [res, newSession] = await loginRequest(platform, username, temp.password);
    
    if (newSession) {
      userSessions[userId] = newSession;
      userSessionRefreshCount[userId] = (userSessionRefreshCount[userId] || 0) + 1;
      userLastSessionRefresh[userId] = now;
      
      log('INFO', `🎄Session refreshed successfully for user ${userId}. Total refreshes: ${userSessionRefreshCount[userId]}`);
      return newSession;
    } else {
      log('ERROR', `❌ Session refresh failed for ${userId}: ${res.msg || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    log('ERROR', `🧨 ERROR refreshing session for ${userId}: ${error.message}`);
    return null;
  }
};

// ============================================
// IMPROVED: BALANCE CHECK FUNCTION
// ============================================

const getBalance = async (session, platform, userId) => {
  const config = getPlatformConfig(platform);
  
  const body = {
    language: platform === '6LOTTERY' ? 7 : 0,
    random: "9078efc6f3794bf49f257d07937d1a29"
  };
  
  if (platform === '6LOTTERY') {
    body.signature = generateSignature6Lottery(body).toUpperCase();
  } else {
    body.signature = signMd5Original(body).toUpperCase();
  }
  
  body.timestamp = Math.floor(Date.now() / 1000);
  
  // Create new axios instance for this request
  const axiosInstance = axios.create({
    httpsAgent: httpsAgent,
    timeout: BALANCE_API_TIMEOUT,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(session.defaults.headers.common.Authorization ? 
        { Authorization: session.defaults.headers.common.Authorization } : {})
    }
  });
  
  try {
    const response = await axiosInstance.post(config.BASE_URL + "GetBalance", body);
    const res = response.data;
    
    if (res.code === 0 && res.data) {
      const amount = res.data.Amount || res.data.amount || res.data.balance;
      
      if (amount !== undefined) {
        const balanceAmount = parseFloat(amount);
        
        if (userGameInfo[userId]) {
          userGameInfo[userId].balance = balanceAmount;
        }
        
        if (!userStats[userId]) {
          userStats[userId] = { start_balance: balanceAmount, profit: 0.0 };
        }
        
        log('INFO', `💰 Balance for ${userId}: ${balanceAmount.toFixed(2)} Ks`);
        return balanceAmount;
      }
      
      log('WARNING', `⚠️ No balance amount found for user ${userId}: ${JSON.stringify(res)}`);
    } else {
      log('ERROR', `❌ Get balance failed for user ${userId}: ${res.msg || 'Unknown error'}, code: ${res.code}`);
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      log('ERROR', `⌛ Balance check timeout for user ${userId} (${config.GAME_NAME})`);
    } else if (error.response) {
      log('ERROR', `❌ Balance API error ${error.response.status} for user ${userId}: ${error.message}`);
    } else if (error.request) {
      log('ERROR', `❌ No response for balance check (${userId}): ${error.message}`);
    } else {
      log('ERROR', `❌ Balance check error for user ${userId}: ${error.message}`);
    }
  }
  
  return null;
};

// ============================================
// IMPROVED: BALANCE CHECK WITH RETRY
// ============================================

const getBalanceWithRetry = async (session, platform, userId, retryCount = 0) => {
  if (retryCount >= MAX_BALANCE_RETRIES) {
    log('ERROR', `❌ Max balance retries reached for user ${userId}`);
    return null;
  }
  
  const balance = await getBalance(session, platform, userId);
  
  if (balance !== null) {
    return balance;
  }
  
  // If balance check failed, try to refresh session
  if (retryCount > 2) {
    log('WARNING', `⚠️ Balance check failed ${retryCount + 1} times, refreshing session for ${userId}`);
    const newSession = await refreshUserSession(userId);
    if (newSession) {
      return await getBalance(newSession, platform, userId, retryCount + 1);
    }
  }
  
  // Wait before retry
  if (retryCount < MAX_BALANCE_RETRIES - 1) {
    const delay = Math.min(BALANCE_RETRY_DELAY * (retryCount + 1), 5000);
    log('WARNING', `⚠️ Balance retry ${retryCount + 1}/${MAX_BALANCE_RETRIES} for ${userId} in ${delay}ms`);
    await setTimeout(delay);
    return await getBalanceWithRetry(session, platform, userId, retryCount + 1);
  }
  
  return null;
};

// ============================================
// CHANNEL VERIFICATION FUNCTIONS
// ============================================

// Check if user is member of all required channels
const checkChannelMembership = async (userId) => {
  const results = [];
  
  for (const channel of requiredChannels) {
    try {
      const member = await bot.getChatMember(channel.id, userId);
      const isMember = member.status !== 'left' && member.status !== 'kicked';
      results.push({ channel, isMember });
      
      log('INFO', `🔍 Channel check for ${userId} in ${channel.id}: ${isMember}`);
    } catch (error) {
      log('ERROR', `🧨 ERROR checking channel ${channel.id}: ${error.message}`);
      results.push({ channel, isMember: false });
    }
  }
  
  return results;
};

// Create channel join message
const createChannelJoinMessage = () => {
  let message = `📢 𝑪𝑯𝑨𝑵𝑵𝑬𝑳 𝑱𝑶𝑰𝑵 𝑹𝑬𝑸𝑼𝑰𝑹𝑬𝑫\n\n`;
  message += `🎄ဘော့ကိုအသုံးပြုရန် အောက်ပါ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍/𝑮𝒓𝒐𝒖𝒑 များသို့ ဝင်ရောက်ပြီး အတည်ပြုရပါမည်:\n\n`;
  
  requiredChannels.forEach((channel, index) => {
    message += `${index + 1}. ${channel.name}\n   🔗 ${channel.id}\n\n`;
  });
  
  message += `\n⚠️ လိုအပ်ချက်:\n`;
  message += `1. အထက်ပါ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍/𝑮𝒓𝒐𝒖𝒑 များသို့ ဝင်ရောက်ပါ\n`;
  message += `2. "🎄𝑽𝒆𝒓𝒊𝒇𝒚 𝑴𝒆𝒎𝒃𝒆𝒓𝒔𝒉𝒊𝒑" ခလုတ်ကို နှိပ်ပါ\n`;
  message += `3. စစ်ဆေးပြီးမှ ဆက်လက်အသုံးပြုနိုင်ပါမည်\n`;
  
  return message;
};

// Channel verification keyboard
const makeChannelVerifyKeyboard = () => {
  const buttons = [];
  
  // Add channel join buttons
  requiredChannels.forEach(channel => {
    buttons.push([{ text: `🔗 𝑱𝒐𝒊𝒏 ${channel.name}`, url: `https://t.me/${channel.id.replace('@', '')}` }]);
  });
  
  // Add verification button
  buttons.push([{ text: "🎄𝑽𝒆𝒓𝒊𝒇𝒚 𝑴𝒆𝒎𝒃𝒆𝒓𝒔𝒉𝒊𝒑", callback_data: "verify_channels" }]);
  buttons.push([{ text: "🔄 𝑪𝒉𝒆𝒄𝒌 𝑨𝒈𝒂𝒊𝒏", callback_data: "check_channels" }]);
  
  return {
    inline_keyboard: buttons
  };
};

// ============================================
// ASCII ART GENERATION FUNCTIONS
// ============================================

// Generate Profit Target Reached ASCII Art
const generateProfitTargetAscii = (startedAmount, totalProfit, finalBalance) => {
  return `
╔══════════════════════════════════════╗
║      🎋 𝑷𝑹𝑶𝑭𝑰𝑻 𝑻𝑨𝑹𝑮𝑬𝑻 𝑹𝑬𝑨𝑪𝑯𝑬𝑫! 🎋     ║
╠══════════════════════════════════════╣
║         🎉 𝑪𝑶𝑵𝑮𝑹𝑨𝑻𝑼𝑳𝑨𝑻𝑰𝑶𝑵𝑺!           ║
╠══════════════════════════════════════╣
║  𝑺𝑻𝑨𝑹𝑻𝑬𝑫 𝑨𝑴𝑶𝑼𝑵𝑻: ${startedAmount.toFixed(2).padStart(12)} Ks  ║
╠══════════════════════════════════════╣
║       𝑫𝑶𝑳𝑰𝑽𝑬𝑹,{𝑱𝑨𝑪𝑲)𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑩𝑶𝑻        ║
╠══════════════════════════════════════╣
║  𝑻𝑶𝑻𝑨𝑳 𝑷𝑹𝑶𝑭𝑰𝑻:  +${totalProfit.toFixed(2).padStart(11)} Ks  ║
║  𝑭𝑰𝑵𝑨𝑳 𝑩𝑨𝑳𝑨𝑵𝑪𝑬: ${finalBalance.toFixed(2).padStart(11)} Ks  ║
╠══════════════════════════════════════╣
║  🧬 𝑫𝑬𝑽𝑬𝑳𝑶𝑷𝑬𝑫 & 𝑫𝑬𝑺𝑰𝑮𝑵𝑬𝑫 𝑩𝒀 𝑫𝑶𝑳𝑰𝑽𝑬𝑹, {𝑱𝑨𝑪𝑲)   ║
╚══════════════════════════════════════╝
`;
};

// Generate Stop Loss Reached ASCII Art
const generateStopLossAscii = (startedAmount, totalProfit, finalBalance) => {
  return `
╔══════════════════════════════════════╗
║       ⚠️ 𝑺𝑻𝑶𝑷 𝑳𝑶𝑺𝑺 𝑹𝑬𝑨𝑪𝑯𝑬𝑫!         ║
╠══════════════════════════════════════╣
║           🎋 𝑩𝑶𝑻 𝑺𝑻𝑶𝑷𝑷𝑬𝑫            ║
╠══════════════════════════════════════╣
║  𝑺𝑻𝑨𝑹𝑻𝑬𝑫 𝑨𝑴𝑶𝑼𝑵𝑻: ${startedAmount.toFixed(2).padStart(12)} Ks  ║
╠══════════════════════════════════════╣
║          𝑫𝑶𝑳𝑰𝑽𝑬𝑹, {𝑱𝑨𝑪𝑲) 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑩𝑶𝑻        ║
╠══════════════════════════════════════╣
║  𝑻𝑶𝑻𝑨𝑳 𝑳𝑶𝑺𝑺:    ${totalProfit.toFixed(2).padStart(12)} Ks  ║
║  𝑭𝑰𝑵𝑨𝑳 𝑩𝑨𝑳𝑨𝑵𝑪𝑬: ${finalBalance.toFixed(2).padStart(11)} Ks  ║
╠══════════════════════════════════════╣
║  🧬 𝑫𝑬𝑽𝑬𝑳𝑶𝑷𝑬𝑫 & 𝑫𝑬𝑺𝑰𝑮𝑵𝑬𝑫 𝑩𝒀 𝑫𝑶𝑳𝑰𝑽𝑬𝑹, {𝑱𝑨𝑪𝑲)   ║
╚══════════════════════════════════════╝
`;
};

// ============================================
// MODERN KEYBOARD LAYOUTS
// ============================================

// Platform selection keyboard
const makePlatformKeyboard = () => {
  return {
    keyboard: [
      ["🎰 𝟕𝟕𝟕 𝑩𝑰𝑮𝑾𝑰𝑵"],
      ["🎲 𝑪𝑲 𝑳𝑶𝑻𝑻𝑬𝑹𝒀"],
      ["🎯 𝟔 𝑳𝑶𝑻𝑻𝑬𝑹𝒀"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

// Main keyboard after platform selection
const makeMainKeyboard = (loggedIn = false, userId = null) => {
  if (!loggedIn) {
    return {
      keyboard: [["🔐 𝑳𝒐𝒈𝒊𝒏"]],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }
  
  // Silent mode status ပေါ်မူတည်ပြီး button text ပြောင်းမယ်
  const silentMode = userSilentMode[userId] || false;
  const silentButton = silentMode ? "🫆 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆" : "🔇 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆";
  
  return {
    keyboard: [
      ["🔋 𝑨𝒄𝒕𝒊𝒗𝒂𝒕𝒆", "🪫 𝑫𝒆𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆"],
      ["💊 𝑩𝒆𝒕_𝑾𝒓𝒂𝒈𝒆𝒓", "🫆 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆"],
      ["📟 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍","🎃 𝑩𝒆𝒕 𝑷𝒍𝒂𝒄𝒆 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔"],
      ["⏰𝑻𝑰𝑴𝑬 𝑺𝑻𝑨𝑹𝑻⏰","🗃 𝑰𝒏𝒇𝒐"],
      ["🔐 𝑹𝒆-𝑳𝒐𝒈𝒊𝒏"]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
};

// Bet Place Settings keyboard
const makeBetPlaceSettingsKeyboard = () => {
  return {
    keyboard: [
      ["🕹 𝑨𝒏𝒕𝒊/𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆"],
      ["🎲 𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆"],
      ["🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑨𝒖𝒕𝒐 𝑩𝒆𝒕"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

// Risk Control keyboard
const makeRiskControlKeyboard = () => {
  return {
    keyboard: [
      ["🧧 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕"],
      ["🌡️ 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒆 𝑳𝒊𝒎𝒊𝒕"],
      ["⛳ 𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓"],
      ["💥 𝑩𝒆𝒕_𝑺𝑳"],
      ["📚 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚"],
      ["🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑨𝒖𝒕𝒐 𝑩𝒆𝒕"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

// Risk Control Strategy Keyboard - NEW VERSION
const makeRiskControlStrategyKeyboard = () => {
  return {
    keyboard: [
      ["🔥 𝑸𝑼𝑨𝑵𝑻𝑼𝑴 𝑩𝑹𝑨𝑰𝑵"],
      ["🌌 𝑯𝒀𝑷𝑬𝑹 𝑫𝑰𝑴𝑬𝑵𝑺𝑰𝑶𝑵𝑨𝑳"],
      ["🎰 𝑨𝑷𝑰 𝑹𝑼𝑳𝑬"],
      ["🤖 𝑹𝑵𝑮 𝑺𝒀𝑺𝑻𝑬𝑴"],
      ["🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

// Time Start keyboard
const makeTimeStartKeyboard = () => {
  return {
    inline_keyboard: [
      [{ text: "🕒 𝑨𝒅𝒅 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕", callback_data: "time_start:add" }],
      [{ text: "📋 𝑽𝒊𝒆𝒘 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕𝒔", callback_data: "time_start:view" }],
      [{ text: "🗑️ 𝑪𝒍𝒆𝒂𝒓 𝑨𝒍𝒍 𝑺𝒕𝒂𝒓𝒕𝒔", callback_data: "time_start:clear" }]
    ]
  };
};

// Admin keyboard
const makeAdminKeyboard = () => {
  return {
    inline_keyboard: [
      [{ text: "📊 𝑼𝒔𝒆𝒓 𝑺𝒕𝒂𝒕𝒔", callback_data: "admin:stats" }],
      [{ text: "📢 𝑩𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕", callback_data: "admin:broadcast" }],
      [{ text: "🚫 𝑩𝒂𝒏 𝑼𝒔𝒆𝒓", callback_data: "admin:ban" }],
      [{ text: "🎄𝑼𝒏𝒃𝒂𝒏 𝑼𝒔𝒆𝒓", callback_data: "admin:unban" }],
      [{ text: "📢 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑴𝒂𝒏𝒂𝒈𝒆𝒎𝒆𝒏𝒕", callback_data: "admin:channels" }],
      [{ text: "🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬", callback_data: "admin:mode_free" }],
      [{ text: "🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬", callback_data: "admin:mode_premium" }]
    ]
  };
};

// Channel Management Keyboard
const makeChannelManagementKeyboard = () => {
  return {
    inline_keyboard: [
      [{ text: "➕ 𝑨𝒅𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍", callback_data: "channel:add" }],
      [{ text: "🗑️ 𝑹𝒆𝒎𝒐𝒗𝒆 𝑪𝒉𝒂𝒏𝒏𝒆𝒍", callback_data: "channel:remove" }],
      [{ text: "📋 𝑳𝒊𝒔𝒕 𝑪𝒉𝒂𝒏𝒏𝒆𝒍𝒔", callback_data: "channel:list" }],
      [{ text: "🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑨𝒅𝒎𝒊𝒏", callback_data: "admin:back" }]
    ]
  };
};

// Login keyboard
const makeLoginKeyboard = () => {
  return {
    keyboard: [["🔐 𝑳𝒐𝒈𝒊𝒏"]],
    resize_keyboard: true,
    one_time_keyboard: false
  };
};

// Game Type keyboard
const makeGameTypeKeyboard = () => {
  return {
    keyboard: [
      ["🎮 𝑻𝑹𝑿"],
      ["⚡ 𝑾𝑰𝑵𝑮𝑶𝟑𝟎𝑺"],
      ["⏰ 𝑾𝑰𝑵𝑮𝑶𝟏𝑴𝑰𝑵"],
      ["🕒 𝑾𝑰𝑵𝑮𝑶𝟑𝑴𝑰𝑵"],
      ["⌛ 𝑾𝑰𝑵𝑮𝑶𝟓𝑴𝑰𝑵"],
      ["🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑩𝒆𝒕 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

// Anti/Martingale keyboard
const makeBettingStrategyKeyboard = () => {
  return {
    keyboard: [
      ["📈 𝑨𝒏𝒕𝒊-𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆"],
      ["📉 𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆"],
      ["⚖️ 𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕"],
      ["🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑩𝒆𝒕 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
};

const makeNumberPadKeyboard = (type, title = "") => {
  return {
    inline_keyboard: [
      [{ text: title || type, callback_data: `${type}:title` }],
      [{ text: "0 (disable)", callback_data: `${type}:0` }],
      [{ text: "1", callback_data: `${type}:1` }, { text: "2", callback_data: `${type}:2` }, { text: "3", callback_data: `${type}:3` }],
      [{ text: "4", callback_data: `${type}:4` }, { text: "5", callback_data: `${type}:5` }, { text: "6", callback_data: `${type}:6` }],
      [{ text: "7", callback_data: `${type}:7` }, { text: "8", callback_data: `${type}:8` }, { text: "9", callback_data: `${type}:9` }]
    ]
  };
};

const makeEntryLayerKeyboard = () => {
  return {
    inline_keyboard: [
      [{ text: "🎢 𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔", callback_data: "layer:title" }],
      [{ text: "0 (disable)", callback_data: "layer_limit:0" }],
      [{ text: "1 (wait for 1 lose)", callback_data: "layer_limit:1" }],
      [{ text: "2 (wait for 2 lose)", callback_data: "layer_limit:2" }],
      [{ text: "3 (wait for 3 lose)", callback_data: "layer_limit:3" }],
      [{ text: "4 (wait for 4 lose)", callback_data: "layer_limit:4" }],
      [{ text: "5 (wait for 5 lose)", callback_data: "layer_limit:5" }],
      [{ text: "6 (wait for 6 lose)", callback_data: "layer_limit:6" }],
      [{ text: "7 (wait for 7 lose)", callback_data: "layer_limit:7" }],
      [{ text: "8 (wait for 8 lose)", callback_data: "layer_limit:8" }],
      [{ text: "9 (wait for 9 lose)", callback_data: "layer_limit:9" }]
    ]
  };
};

// ============================================
// GAME TYPE CONFIGURATION
// ============================================

const GAME_TYPE_IDS = {
  '777BIGWIN': {
    'TRX': 13,
    'WINGO30S': 30,
    'WINGO1MIN': 1,
    'WINGO3MIN': 2,
    'WINGO5MIN': 3
  },
  'CKLOTTERY': {
    'TRX': 13,
    'WINGO30S': 30,
    'WINGO1MIN': 1,
    'WINGO3MIN': 2,
    'WINGO5MIN': 3
  },
  '6LOTTERY': {
    'TRX': 13,
    'WINGO30S': 30,
    'WINGO1MIN': 1,
    'WINGO3MIN': 2,
    'WINGO5MIN': 3
  }
};

const getGameTypeId = (platform, gameType) => {
  const platformConfig = GAME_TYPE_IDS[platform] || GAME_TYPE_IDS['777BIGWIN'];
  return platformConfig[gameType] || (gameType === 'TRX' ? 13 : 30);
};

// ============================================
// TEXT-BASED MESSAGE FORMATTING
// ============================================

const createProfitTargetMessage = (targetProfit, currentBalance, platform, startedAmount, totalProfit) => {
  const asciiArt = generateProfitTargetAscii(startedAmount, totalProfit, currentBalance);
  
  return `${asciiArt}
  
🎊 𝑩𝒐𝒕 𝒔𝒕𝒐𝒑𝒑𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚!
📈 𝑬𝒙𝒄𝒆𝒍𝒍𝒆𝒏𝒕 𝒑𝒆𝒓𝒇𝒐𝒓𝒎𝒂𝒏𝒄𝒆!
  `;
};

const createStopLossMessage = (stopLoss, currentBalance, platform, startedAmount, totalProfit) => {
  const asciiArt = generateStopLossAscii(startedAmount, totalProfit, currentBalance);
  
  return `${asciiArt}

🛑 𝑩𝒐𝒕 𝒔𝒕𝒐𝒑𝒑𝒆𝒅 𝒂𝒖𝒕𝒐𝒎𝒂𝒕𝒊𝒄𝒂𝒍𝒍𝒚!
📊 𝑹𝒆𝒗𝒊𝒆𝒘 𝒚𝒐𝒖𝒓 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒚!
  `;
};

// Simple message functions instead of HTML
const showProfitTargetReached = async (targetProfit, currentBalance, platform, userId, startedAmount, totalProfit) => {
  try {
    // Delete profit update message if exists
    if (userProfitMessageId[userId]) {
      try {
        await bot.deleteMessage(userId, userProfitMessageId[userId]);
      } catch (error) {
        log('INFO', `⚠️ Could not delete profit message: ${error.message}`);
      }
      delete userProfitMessageId[userId];
    }
    
    const message = createProfitTargetMessage(targetProfit, currentBalance, platform, startedAmount, totalProfit);
    await sendMessageWithRetry(userId, message);
    log('INFO', `🧧 Profit Target reached notification sent to ${userId}`);
    return true;
  } catch (error) {
    log('ERROR', `🧨 ERROR sending profit target notification: ${error.message}`);
    return false;
  }
};

const showStopLossReached = async (stopLoss, currentBalance, platform, userId, startedAmount, totalProfit) => {
  try {
    // Delete profit update message if exists
    if (userProfitMessageId[userId]) {
      try {
        await bot.deleteMessage(userId, userProfitMessageId[userId]);
      } catch (error) {
        log('INFO', `⚠️ Could not delete profit message: ${error.message}`);
      }
      delete userProfitMessageId[userId];
    }
    
    const message = createStopLossMessage(stopLoss, currentBalance, platform, startedAmount, totalProfit);
    await sendMessageWithRetry(userId, message);
    log('INFO', `🛑 Stop loss reached notification sent to ${userId}`);
    return true;
  } catch (error) {
    log('ERROR', `🧨 ERROR sending stop loss notification: ${error.message}`);
    return false;
  }
};

// ============================================
// SILENT MODE PROFIT UPDATE FUNCTION
// ============================================

const updateProfitMessage = async (userId, chatId, currentBalance, currentProfit) => {
  try {
    const silentMode = userSilentMode[userId] || false;
    
    // Silent mode မှာပဲ auto-edit လုပ်မယ်
    if (!silentMode) return;
    
    const settings = userSettings[userId] || {};
    const platform = settings.platform || '777BIGWIN';
    const config = getPlatformConfig(platform);
    const gameType = settings.game_type || "TRX";
    
    if (userProfitMessageId[userId]) {
      // Existing message ကို edit လုပ်မယ်
      const updateMessage = `
📊 𝑳𝑰𝑽𝑬 𝑷𝑹𝑶𝑭𝑰𝑻 𝑼𝑷𝑫𝑨𝑻𝑬
════════════════════════
🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}
🎯 𝑮𝒂𝒎𝒆: ${gameType}
🧩 𝑪𝒖𝒓𝒓𝒆𝒏𝒕 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(currentBalance ).toFixed(2)} Ks
📈 𝑪𝒖𝒓𝒓𝒆𝒏𝒕 𝑷𝒓𝒐𝒇𝒊𝒕: ${currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)} Ks
════════════════════════
🔄 𝑼𝒑𝒅𝒂𝒕𝒆𝒅: ${new Date().toLocaleTimeString()}
`;
      
      try {
        await bot.editMessageText(updateMessage, {
          chat_id: chatId,
          message_id: userProfitMessageId[userId],
          parse_mode: 'HTML'
        });
        
        userLastProfit[userId] = currentProfit;
        log('INFO', `📊 Updated profit message for user ${userId}: ${currentProfit.toFixed(2)} Ks`);
      } catch (error) {
        log('ERROR', `🧨 ERROR updating profit message: ${error.message}`);
      }
    } else {
      // New message စတင်ဖန်တီးမယ်
      const initialMessage = `
📊 𝑳𝑰𝑽𝑬 𝑷𝑹𝑶𝑭𝑰𝑻 𝑼𝑷𝑫𝑨𝑻𝑬
════════════════════════
🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}
🎯 𝑮𝒂𝒎𝒆: ${gameType}
🧩 𝑪𝒖𝒓𝒓𝒆𝒏𝒕 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(currentBalance ).toFixed(2)} Ks
📈 𝑪𝒖𝒓𝒓𝒆𝒏𝒕 𝑷𝒓𝒐𝒇𝒊𝒕: ${currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)} Ks
════════════════════════
🔄 𝑼𝒑𝒅𝒂𝒕𝒆𝒅: ${new Date().toLocaleTimeString()}
`;
      
      try {
        const sentMessage = await bot.sendMessage(chatId, initialMessage, { parse_mode: 'HTML' });
        userProfitMessageId[userId] = sentMessage.message_id;
        userLastProfit[userId] = currentProfit;
        log('INFO', `📊 Created profit message for user ${userId}`);
      } catch (error) {
        log('ERROR', `🧨 ERROR creating profit message: ${error.message}`);
      }
    }
  } catch (error) {
    log('ERROR', `🧨 ERROR in updateProfitMessage: ${error.message}`);
  }
};

// ============================================
// TIME START SETTINGS FUNCTIONS
// ============================================

const parseTime = (timeStr) => {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3] ? match[3].toLowerCase() : '';
  
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  
  return { hours, minutes };
};

const formatTime = (hours, minutes) => {
  const period = hours >= 12 ? 'p.m.' : 'a.m.';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${period}`;
};

const isWithinTimeStart = (userId) => {
  const timeStarts = userTimeStarts[userId] || [];
  if (timeStarts.length === 0) return true; // No time restrictions
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  // Check each start time
  for (const startTime of timeStarts) {
    const parsed = parseTime(startTime);
    if (!parsed) continue;
    
    const startMinutes = parsed.hours * 60 + parsed.minutes;
    
    // Bot will run for 1 hour after each start time
    const endMinutes = startMinutes + 60; // 1 hour window
    
    if (currentTime >= startMinutes && currentTime <= endMinutes) {
      return true;
    }
    
    // Handle overnight window
    if (endMinutes > 1440) {
      if (currentTime >= startMinutes || currentTime <= (endMinutes % 1440)) {
        return true;
      }
    }
  }
  
  return false;
};

const addTimeStart = (userId, startTime) => {
  if (!userTimeStarts[userId]) {
    userTimeStarts[userId] = [];
  }
  
  const parsed = parseTime(startTime);
  
  if (!parsed) {
    return { success: false, message: '𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝒕𝒊𝒎𝒆 𝒇𝒐𝒓𝒎𝒂𝒕. 𝑼𝒔𝒆 𝒇𝒐𝒓𝒎𝒂𝒕: 9:00𝒂𝒎 𝒐𝒓 14:30' };
  }
  
  // Check if already exists
  if (userTimeStarts[userId].includes(startTime)) {
    return { success: false, message: '𝑻𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕 𝒂𝒍𝒓𝒆𝒂𝒅𝒚 𝒆𝒙𝒊𝒔𝒕𝒔' };
  }
  
  userTimeStarts[userId].push(startTime);
  
  // Sort by time
  userTimeStarts[userId].sort((a, b) => {
    const timeA = parseTime(a);
    const timeB = parseTime(b);
    return (timeA.hours * 60 + timeA.minutes) - (timeB.hours * 60 + timeB.minutes);
  });
  
  saveTimeStartSettings();
  
  return { 
    success: true, 
    message: `⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕 𝒂𝒅𝒅𝒆𝒅: ${formatTime(parsed.hours, parsed.minutes)}\n\n🎯 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒓𝒖𝒏 𝒇𝒐𝒓 1 𝒉𝒐𝒖𝒓 𝒇𝒓𝒐𝒎 𝒕𝒉𝒊𝒔 𝒕𝒊𝒎𝒆` 
  };
};

const getTimeStartDisplay = (userId) => {
  const starts = userTimeStarts[userId] || [];
  if (starts.length === 0) {
    return '🕒 𝑵𝒐 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕𝒔 𝒔𝒆𝒕. 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒓𝒖𝒏 24/7.';
  }
  
  let display = '⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕𝒔:\n\n';
  starts.forEach((start, index) => {
    const parsed = parseTime(start);
    if (parsed) {
      display += `${index + 1}. ${formatTime(parsed.hours, parsed.minutes)}\n`;
      display += `   🎯 𝑹𝒖𝒏𝒔: ${formatTime(parsed.hours, parsed.minutes)} - ${formatTime((parsed.hours + 1) % 24, parsed.minutes)}\n\n`;
    }
  });
  
  display += `📊 𝑻𝒐𝒕𝒂𝒍: ${starts.length} 𝒔𝒕𝒂𝒓𝒕 𝒕𝒊𝒎𝒆(𝒔)`;
  return display;
};

const clearTimeStarts = (userId) => {
  if (userTimeStarts[userId]) {
    delete userTimeStarts[userId];
    saveTimeStartSettings();
    return { success: true, message: '🎄𝑨𝒍𝒍 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕𝒔 𝒄𝒍𝒆𝒂𝒓𝒆𝒅.' };
  }
  return { success: false, message: '⚠️ 𝑵𝒐 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕𝒔 𝒕𝒐 𝒄𝒍𝒆𝒂𝒓.' };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const getPlatformConfig = (platform) => {
  return PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS['777BIGWIN'];
};

const getAllowedUsersSet = (platform) => {
  if (platform === '777BIGWIN') return allowed777bigwinIds;
  if (platform === 'CKLOTTERY') return allowedcklotteryIds;
  if (platform === '6LOTTERY') return allowed6lotteryIds;
  return new Set();
};

const setAllowedUsersSet = (platform, set) => {
  if (platform === '777BIGWIN') allowed777bigwinIds = set;
  if (platform === 'CKLOTTERY') allowedcklotteryIds = set;
  if (platform === '6LOTTERY') allowed6lotteryIds = set;
};

const loadAllowedUsers = async (platform) => {
  const config = getPlatformConfig(platform);
  try {
    const data = await fs.readFile(config.ALLOWED_USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    setAllowedUsersSet(platform, new Set(parsed.allowed_ids || []));
    log('INFO', `📂 Loaded ${getAllowedUsersSet(platform).size} users for ${config.GAME_NAME}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('WARNING', `${config.ALLOWED_USERS_FILE} not found. Starting fresh`);
      setAllowedUsersSet(platform, new Set());
      await saveAllowedUsers(platform);
    } else {
      log('ERROR', `🧨 ERROR loading ${config.ALLOWED_USERS_FILE}: ${error.message}`);
      setAllowedUsersSet(platform, new Set());
    }
  }
};

const saveAllowedUsers = async (platform) => {
  const config = getPlatformConfig(platform);
  try {
    await fs.writeFile(
      config.ALLOWED_USERS_FILE,
      JSON.stringify({ allowed_ids: Array.from(getAllowedUsersSet(platform)) }, null, 2)
    );
    log('INFO', `💾 Saved ${getAllowedUsersSet(platform).size} users for ${config.GAME_NAME}`);
  } catch (error) {
    log('ERROR', `🧨 ERROR saving user list for ${platform}: ${error.message}`);
  }
};

const normalizeText = (text) => {
  return text.normalize('NFKC').trim();
};

const signMd5 = (data) => {
  const filtered = { ...data };
  delete filtered.signature;
  delete filtered.timestamp;
  
  const sorted = Object.keys(filtered)
    .sort()
    .reduce((result, key) => {
      result[key] = filtered[key];
      return result;
    }, {});
    
  const jsonStr = JSON.stringify(sorted, Object.keys(sorted).sort());
  return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
};

const signMd5Original = (data) => {
  const dataCopy = { ...data };
  delete dataCopy.signature;
  delete dataCopy.timestamp;
  
  const sorted = Object.keys(dataCopy)
    .sort()
    .reduce((result, key) => {
      result[key] = dataCopy[key];
      return result;
    }, {});
    
  const jsonStr = JSON.stringify(sorted, Object.keys(sorted).sort());
  return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
};

const generateSignature6Lottery = (data) => {
  const f = {};
  const exclude = ["signature", "track", "xosoBettingData"];
  
  const sortedKeys = Object.keys(data).sort();
  
  for (const k of sortedKeys) {
    const v = data[k];
    if (v !== null && v !== '' && !exclude.includes(k)) {
      f[k] = v === 0 ? 0 : v;
    }
  }
  
  const jstr = JSON.stringify(f, Object.keys(f).sort());
  return crypto.createHash('md5').update(jstr).digest('hex').toUpperCase();
};

const computeUnitAmount = (amt) => {
  if (amt <= 0) return 1;
  
  const amtStr = amt.toString();
  const trailingZeros = amtStr.length - amtStr.replace(/0+$/, '').length;
  
  if (trailingZeros === 4) return 10000;
  if (trailingZeros === 3) return 1000;
  if (trailingZeros === 2) return 100;
  if (trailingZeros === 1) return 10;
  
  return Math.pow(10, amtStr.length - 1);
};

const getSelectMap = () => {
  return { "B": 13, "S": 14 };
};

const sendMessageWithRetry = async (chatId, text, replyMarkup, disableNotification = false) => {
  // Silent Mode စစ်ဆေးခြင်း
  const silentMode = userSilentMode[chatId] || false;
  const settings = userSettings[chatId] || {};
  
  // Silent Mode ဖြစ်နေရင် အချို့ message တွေ skip လုပ်မယ်
  if (silentMode) {
    const silentKeywords = ["🏆 WIN", "⛔ LOSE", "🟢 WIN", "🔴 LOSE", "🎮", "BET:"];
    const isSilentMessage = silentKeywords.some(keyword => text.includes(keyword));
    
    if (isSilentMessage && !settings.running) {
      log('INFO', `🔇 Silent Mode: Skipping message to ${chatId}: ${text.substring(0, 50)}...`);
      return true;
    }
  }
  
  if (FAST_MODE && (text.includes("🎮") || text.includes("BET:") || text.includes("WIN") || text.includes("LOSE"))) {
    try {
      await bot.sendMessage(chatId, text, { 
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
        disable_notification: silentMode || disableNotification
      });
      log('INFO', `📨 Fast message sent to ${chatId} (Silent: ${silentMode})`);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  for (let attempt = 0; attempt < MAX_TELEGRAM_RETRIES; attempt++) {
    try {
      await bot.sendMessage(chatId, text, { 
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
        disable_notification: silentMode || disableNotification
      });
      log('INFO', `📨 Message sent to ${chatId} (Silent: ${silentMode})`);
      return true;
    } catch (error) {
      log('ERROR', `❌ Failed to send message to ${chatId}, attempt ${attempt + 1}/${MAX_TELEGRAM_RETRIES}: ${error.message}`);
      
      if (attempt < MAX_TELEGRAM_RETRIES - 1) {
        await setTimeout(TELEGRAM_RETRY_DELAY);
        continue;
      }
      
      return false;
    }
  }
  
  return false;
};

const checkUserAuthorization = (platform, gameUserId) => {
  const allowedSet = getAllowedUsersSet(platform);
  
  if (SYSTEM_MODE === 'FREE') {
    return true;
  }
  
  if (SYSTEM_MODE === 'PREMIUM') {
    return allowedSet.has(gameUserId);
  }
  
  return true;
};

const broadcastMessage = async (message, adminId) => {
  const allUsers = Object.keys(userSessions);
  let successCount = 0;
  let failCount = 0;
  
  log('INFO', `📢 Starting broadcast to ${allUsers.length} users`);
  
  for (const userId of allUsers) {
    try {
      await sendMessageWithRetry(userId, `📢 𝑩𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕 𝑴𝒆𝒔𝒔𝒂𝒈𝒆:\n\n${message}`);
      successCount++;
      log('INFO', `📨 Broadcast sent to user ${userId}`);
    } catch (error) {
      log('ERROR', `❌ Failed to broadcast to user ${userId}: ${error.message}`);
      failCount++;
    }
    
    await setTimeout(100);
  }
  
  const report = `📢 𝑩𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕 𝑹𝒆𝒑𝒐𝒓𝒕\n\n🎄𝑺𝒆𝒏𝒕: ${successCount} 𝒖𝒔𝒆𝒓𝒔\n❌ 𝑭𝒂𝒊𝒍𝒆𝒅: ${failCount} 𝒖𝒔𝒆𝒓𝒔\n\n𝑻𝒐𝒕𝒂𝒍: ${allUsers.length} 𝒖𝒔𝒆𝒓𝒔`;
  await sendMessageWithRetry(adminId, report);
};

// ============================================
// MESSAGE FORMATTING
// ============================================

const formatLoginMessage = (platform, gameName) => {
  const modeInfo = SYSTEM_MODE === 'FREE' ? 
    "🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬 - 𝑨𝒍𝒍 𝒖𝒔𝒆𝒓𝒔 𝒘𝒆𝒍𝒄𝒐𝒎𝒆!" : 
    "🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬 - 𝑨𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒖𝒔𝒆𝒓𝒔 𝒐𝒏𝒍𝒚";
  
  return `🎰 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅: ${gameName}\n${modeInfo}\n\n𝑵𝒐𝒘 𝒑𝒍𝒆𝒂𝒔𝒆 𝒍𝒐𝒈𝒊𝒏 𝒘𝒊𝒕𝒉:\n\n𝑳𝒐𝒈𝒊𝒏\n𝒀𝒐𝒖𝒓𝑷𝒉𝒐𝒏𝒆𝑵𝒖𝒎𝒃𝒆𝒓\n𝒀𝒐𝒖𝒓𝑷𝒂𝒔𝒔𝒘𝒐𝒓𝒅`;
};

const formatWelcomeMessage = () => {
  const modeInfo = SYSTEM_MODE === 'FREE' ? 
    "🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬 - 𝑶𝒑𝒆𝒏 𝒇𝒐𝒓 𝒆𝒗𝒆𝒓𝒚𝒐𝒏𝒆" : 
    "🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬 - 𝑬𝒙𝒄𝒍𝒖𝒔𝒊𝒗𝒆 𝒂𝒄𝒄𝒆𝒔𝒔";
  
  return `မင်္ဂလာပါ ယခုBotကို မောင်ကီကီမှ  အဆင်မပြေပါက Admin @kiki20251 အား ဆက်သွယ်ပါ\n${modeInfo}\n\n𝗙𝗘𝗔𝗧𝗨𝗥𝗘𝗦 ✨
├─ 🎯 𝑨𝒖𝒕𝒐 𝑩𝒆𝒕
├─ 🤖 𝑩&𝑺 𝑨𝒍𝒈𝒐𝒓𝒊𝒕𝒉𝒎
└─ ⏳ 𝟐𝟒/𝟕 𝑨𝒄𝒕𝒊𝒗𝒆
├─ 🎰 𝟕𝟕𝟕 𝑩𝑰𝑮𝑾𝑰𝑵:
   https://www.777bigwingame.co/#/register?invitationCode=84318565611
================================
📞 𝗖𝗢𝗡𝗧𝗔𝗖𝗧 𝗜𝗙𝗢 📞
├─ 👑 𝑨𝒅𝒎𝒊𝒏: @kiki20251
================================
   🚀 𝑺𝑻𝑨𝑹𝑻: Click 🔐 𝑳𝒐𝒈𝒊𝒏`;
};

const formatLoginSuccess = (config, userInfo, balance) => {
  const modeStatus = SYSTEM_MODE === 'FREE' ? 
    "🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬 𝑨𝒄𝒄𝒆𝒔𝒔" : 
    "🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬 𝑨𝒄𝒄𝒆𝒔𝒔";
  
  return `🎄𝑳𝒐𝒈𝒊𝒏 𝑺𝒖𝒄𝒄𝒆𝒔𝒔!\n${modeStatus}\n🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}\n🆔 𝑼𝒔𝒆𝒓 𝑰𝑫: ${userInfo.user_id}\n💳 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(balance ).toFixed(2)} Ks`;
};

const formatBetMessage = (config, gameType, currentIssue, ch, amount, skipBetting) => {
  return `🎮 ${config.GAME_NAME}\n🎯 𝑩𝒆𝒕: ${ch === 'B' ? '𝑩𝒊𝒈' : '𝑺𝒎𝒂𝒍𝒍'} ${skipBetting ? 0 : (amount ).toFixed(2)} Ks\n🧭 ${gameType}: ${currentIssue}`;
};

const formatWinMessage = (amount, bigSmall, number, balance, profit) => {
  return `🏆 𝑾𝑰𝑵 +${(amount ).toFixed(2)} Ks\n════════════════════════\n📊 𝑹𝒆𝒔𝒖𝒍𝒕: ${bigSmall} (${number})\n🧩 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(balance ).toFixed(2)} Ks\n📈 𝑻𝒐𝒕𝒂𝒍 𝑷𝒓𝒐𝒇𝒊𝒕: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} Ks`;
};

const formatLoseMessage = (amount, bigSmall, number, balance, profit) => {
  return `⛔ 𝑳𝑶𝑺𝑬 -${(amount ).toFixed(2)} Ks\n════════════════════════\n📊 𝑹𝒆𝒔𝒖𝒍𝒕: ${bigSmall} (${number})\n🧩 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(balance ).toFixed(2)} Ks\n📉 𝑻𝒐𝒕𝒂𝒍 𝑷𝒓𝒐𝒇𝒊𝒕: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} Ks`;
};

const formatInfoMessage = (config, userInfo, settings, currentBalance, gameType, userId) => {
  let strategyName = "❌ 𝑵𝑶𝑻 𝑺𝑬𝑳𝑬𝑪𝑻𝑬𝑫";
  const strategy = settings.strategy;
  
  if (!strategy) {
    strategyName = "❌ 𝑵𝑶𝑻 𝑺𝑬𝑳𝑬𝑪𝑻𝑬𝑫\n👉 𝑮𝒐 𝒕𝒐 '📟 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍' → '📚 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚' 𝒕𝒐 𝒄𝒉𝒐𝒐𝒔𝒆";
  }
  else if (strategy === "QUANTUM_BRAIN") {
    strategyName = "🔥 𝑸𝑼𝑨𝑵𝑻𝑼𝑴 𝑩𝑹𝑨𝑰𝑵";
  }
  else if (strategy === "HYPER_DIMENSIONAL") {
    strategyName = "🌌 𝑯𝒀𝑷𝑬𝑹 𝑫𝑰𝑴𝑬𝑵𝑺𝑰𝑶𝑵𝑨𝑳";
  }
  else if (strategy === "API_RULE") {
    strategyName = "🎰 𝑨𝑷𝑰 𝑹𝑼𝑳𝑬";
  }
  else if (strategy === "RNG_SYSTEM") {
    strategyName = "🤖 𝑹𝑵𝑮 𝑺𝒀𝑺𝑻𝑬𝑴";
  }
  else {
    strategyName = `❓ ${strategy}`;
  }
  
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [];
  const profitTarget = settings.target_profit;
  const stopLoss = settings.stop_loss;
  const slLimit = settings.sl_limit;
  const layerLimit = settings.layer_limit;
  const mode = settings.mode || "REAL";
  const running = settings.running ? '🔋 𝑨𝒄𝒕𝒊𝒗𝒂𝒕𝒆' : '🪫 𝑫𝒆𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆';
  
  const silentMode = userSilentMode && userSilentMode[userId] ? '🔇 𝑶𝒏' : '🔈 𝑶𝒇𝒇';
  
  const timeStarts = userTimeStarts[userInfo?.user_id] || [];
  const timeStartInfo = timeStarts.length > 0 ? 
    `${timeStarts.length} 𝒔𝒕𝒂𝒓𝒕 𝒕𝒊𝒎𝒆(𝒔) 𝒂𝒄𝒕𝒊𝒗𝒆` : '24/7 (𝒏𝒐 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒊𝒐𝒏)';
  
  const balanceDisplay = currentBalance !== null ? (currentBalance ).toFixed(2) : 'N/A';
  const profitTargetDisplay = typeof profitTarget === 'number' ? profitTarget.toFixed(2) + ' Ks' : '𝑵𝒐𝒕 𝑺𝒆𝒕';
  const stopLossDisplay = typeof stopLoss === 'number' ? stopLoss.toFixed(2) + ' Ks' : '𝑵𝒐𝒕 𝑺𝒆𝒕';
  
  return (
    `📊 𝑼𝑺𝑬𝑹 𝑰𝑵𝑭𝑶\n` +
    `════════════════════════\n` +
    `🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}\n` +
    `👤 𝑼𝒔𝒆𝒓 𝑰𝑫: ${userInfo?.user_id || 'N/A'}\n` +
    `🧩 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${balanceDisplay} Ks\n` +
    `🫆 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆: ${silentMode}\n` +
    `════════════════════════\n` +
    `⚙️ 𝑺𝑬𝑻𝑻𝑰𝑵𝑮𝑺\n` +
    `════════════════════════\n` +
    `🎮 𝑮𝒂𝒎𝒆: ${gameType}\n` +
    `🎛 𝑴𝒐𝒅𝒆: ${mode}\n` +
    `📚 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚: ${strategyName}\n` +
    `🕹 𝑩𝒆𝒕𝒕𝒊𝒏𝒈 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚: ${bettingStrategy}\n` +
    `💊 𝑩𝒆𝒕_𝑾𝒓𝒂𝒈𝒆𝒓: ${betSizes.map(s => s.toString()).join(', ') || '𝑵𝒐𝒕 𝑺𝒆𝒕'} MMK\n` +
    `════════════════════════\n` +
    `🧧 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕: ${profitTargetDisplay}\n` +
    `🌡️ 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒔: ${stopLossDisplay}\n` +
    `🐦‍🔥𝑺𝑳 𝑳𝒊𝒎𝒊𝒕: ${slLimit !== undefined ? slLimit : '𝑵𝒐𝒕 𝑺𝒆𝒕'}\n` +
    `🎢 𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓: ${layerLimit !== undefined ? layerLimit : '𝑵𝒐𝒕 𝑺𝒆𝒕'}\n` +
    `⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕𝒔: ${timeStartInfo}\n` +
    `════════════════════════\n` +
    `🚀 𝑺𝒕𝒂𝒕𝒖𝒔: ${running}`
  );
};

const formatUserStats = () => {
  const stats = getUserStatistics();
  const modeStatus = SYSTEM_MODE === 'FREE' ? 
    "🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬 - 𝑶𝒑𝒆𝒏 𝑨𝒄𝒄𝒆𝒔𝒔" : 
    "🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬 - 𝑹𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅";
  
  return (
    `📊 𝑺𝒀𝑺𝑻𝑬𝑴 𝑺𝑻𝑨𝑻𝑰𝑺𝑻𝑰𝑪𝑺\n` +
    `════════════════════════\n` +
    `${modeStatus}\n` +
    `════════════════════════\n` +
    `👥 𝑻𝒐𝒕𝒂𝒍 𝑼𝒔𝒆𝒓𝒔: ${stats.totalUsers}\n` +
    `🟢 𝑨𝒄𝒕𝒊𝒗𝒆 𝑼𝒔𝒆𝒓𝒔: ${stats.activeUsers}\n` +
    `🔴 𝑩𝒂𝒏𝒏𝒆𝒅 𝑼𝒔𝒆𝒓𝒔: ${stats.bannedUsers}\n` +
    `⚫ 𝑰𝒏𝒂𝒄𝒕𝒊𝒗𝒆 𝑼𝒔𝒆𝒓𝒔: ${stats.inactiveUsers}\n` +
    `════════════════════════`
  );
};

// ============================================
// API FUNCTIONS - COMPLETE REFERENCE IMPLEMENTATION
// ============================================

// 1. Login Request API
const loginRequest = async (platform, phone, password) => {
  const config = getPlatformConfig(platform);
  
  let session;
  if (platform === '6LOTTERY') {
    // 6LOTTERY specific headers
    session = axios.create({
      httpsAgent,
      timeout: 20000,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Ar-Origin": "https://6win598.com",
        "Origin": "https://6win598.com",
        "Referer": "https://6win598.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
        "Accept-Language": "en-US,en;q=0.5",
      }
    });
  } else {
    session = axios.create({
      httpsAgent,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; Mobile Build/QP1A.190711.020)",
        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip"
      }
    });
  }
  
  const body = {
    phonetype: platform === '6LOTTERY' ? 1 : -1,
    language: platform === '6LOTTERY' ? 7 : 0,
    logintype: "mobile",
    random: "9078efc98754430e92e51da59eb2563c",
    username: config.LOGIN_PREFIX + phone,
    pwd: password
  };
  
  if (platform === '6LOTTERY') {
    body.deviceId = "5dcab3e06db88a206975e91ea6ac7c87";
    body.packId = "";
    body.signature = generateSignature6Lottery(body).toUpperCase();
  } else {
    body.signature = signMd5Original(body).toUpperCase();
  }
  
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post(config.BASE_URL + "Login", body, { timeout: 20000 });
    const res = response.data;
    
    if (res.code === 0 && res.data) {
      const tokenHeader = res.data.tokenHeader || "Bearer ";
      const token = res.data.token || "";
      
      if (platform === '6LOTTERY') {
        // Update 6LOTTERY session with authorization header
        session.defaults.headers.common.Authorization = `${tokenHeader}${token}`;
        session.defaults.headers.common["Ar-Origin"] = "https://6win598.com";
        session.defaults.headers.common["Origin"] = "https://6win598.com";
        session.defaults.headers.common["Referer"] = "https://6win598.com/";
      } else {
        session.defaults.headers.common.Authorization = `${tokenHeader}${token}`;
      }
      
      log('INFO', `🎄${config.GAME_NAME} Login successful for user ${phone}`);
      return [res, session];
    }
    
    log('ERROR', `❌ ${config.GAME_NAME} Login failed: ${res.msg || 'Unknown error'}`);
    return [res, null];
  } catch (error) {
    log('ERROR', `❌ ${config.GAME_NAME} Login error: ${error.message}`);
    return [{ error: error.message, code: -1 }, null];
  }
};

// 2. Get User Info API
const getUserInfo = async (session, platform, userId) => {
  const config = getPlatformConfig(platform);
  const body = {
    language: platform === '6LOTTERY' ? 7 : 0,
    random: "9078efc98754430e92e51da59eb2563c"
  };
  
  if (platform === '6LOTTERY') {
    body.signature = generateSignature6Lottery(body).toUpperCase();
  } else {
    body.signature = signMd5Original(body).toUpperCase();
  }
  
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post(config.BASE_URL + "GetUserInfo", body, { timeout: 15000 });
    const res = response.data;
    
    if (res.code === 0 && res.data) {
      const info = {
        user_id: res.data.userId,
        username: res.data.userName,
        nickname: res.data.nickName,
        balance: res.data.amount,
        photo: res.data.userPhoto,
        login_date: res.data.userLoginDate,
        withdraw_count: res.data.withdrawCount,
        is_allow_withdraw: res.data.isAllowWithdraw === 1
      };
      
      userGameInfo[userId] = info;
      return info;
    }
  } catch (error) {
    log('ERROR', `❌ Get user info error for ${config.GAME_NAME}: ${error.message}`);
  }
  
  return null;
};

// 3. Get Game Issue API
const getGameIssueRequest = async (session, platform, gameType = "TRX") => {
  const config = getPlatformConfig(platform);
  
  const typeId = getGameTypeId(platform, gameType);
  
  let language, random, endpoint;
  
  if (gameType === "TRX") {
    language = 0;
    random = "b05034ba4a2642009350ee863f29e2e9";
    endpoint = "GetTrxGameIssue";
  } else {
    language = 7;
    
    if (platform === '6LOTTERY') {
      random = gameType === "WINGO30S" ? "6958cae52e234eb1967082c9b5a9c4ce" : 
               gameType === "WINGO1MIN" ? "6958cae52e234eb1967082c9b5a9c4ce" :
               gameType === "WINGO3MIN" ? "6958cae52e234eb1967082c9b5a9c4ce" :
               gameType === "WINGO5MIN" ? "6958cae52e234eb1967082c9b5a9c4ce" : 
               "6958cae52e234eb1967082c9b5a9c4ce";
    } else {
      random = gameType === "WINGO30S" ? "7d76f361dc5d4d8c98098ae3d48ef7af" :
               gameType === "WINGO1MIN" ? "7d76f361dc5d4d8c98098ae3d48ef7af" :
               gameType === "WINGO3MIN" ? "7d76f361dc5d4d8c98098ae3d48ef7af" :
               gameType === "WINGO5MIN" ? "7d76f361dc5d4d8c98098ae3d48ef7af" : 
               "7d76f361dc5d4d8c98098ae3d48ef7af";
    }
    
    endpoint = "GetGameIssue";
  }
  
  const body = {
    typeID: typeId,
    language: language,
    random: random
  };
  
  if (platform === '6LOTTERY') {
    body.signature = generateSignature6Lottery(body).toUpperCase();
  } else {
    body.signature = signMd5(body).toUpperCase();
  }
  
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post(config.BASE_URL + endpoint, body, { timeout: 15000 });
    log('INFO', `${gameType} game issue request for ${config.GAME_NAME} (typeId: ${typeId})`);
    return response.data;
  } catch (error) {
    log('ERROR', `${gameType} game issue error for ${config.GAME_NAME}: ${error.message}`);
    return { error: error.message, code: -1 };
  }
};

// 4. Get Wingo Game Results API
const getWingoGameResults = async (session, platform, gameType = "WINGO30S") => {
  const config = getPlatformConfig(platform);
  
  const typeId = getGameTypeId(platform, gameType);
  
  const body = {
    "pageSize": 10,
    "typeId": typeId,
    "language": 7,
    "random": "6958cae52e234eb1967082c9b5a9c4ce",
    "signature": "88A0DADB43645500E64ADFFED763027E",
    "timestamp": Math.floor(Date.now() / 1000)
  };
  
  try {
    const response = await session.post(config.BASE_URL + "GetNoaverageEmerdList", body, { timeout: 15000 });
    log('INFO', `📊 Got ${gameType} results for ${config.GAME_NAME} (typeId: ${typeId})`);
    return response.data;
  } catch (error) {
    log('ERROR', `🧨 ERROR getting ${gameType} results for ${config.GAME_NAME}: ${error.message}`);
    return { error: error.message, code: -1 };
  }
};

// 5. Place Bet API
const placeBetRequest = async (session, platform, issueNumber, selectType, unitAmount, betCount, gameType, userId) => {
  const config = getPlatformConfig(platform);
  
  const typeId = getGameTypeId(platform, gameType);
  
  let language, random, endpoint;
  
  if (gameType === "TRX") {
    language = 0;
    random = "9078efc98754430e92e51da59eb2563c";
    endpoint = "GameTrxBetting";
  } else {
    language = 7;
    
    if (platform === '6LOTTERY') {
      random = gameType === "WINGO30S" ? "9078efc98754430e92e51da59eb2563c" :
               gameType === "WINGO1MIN" ? "9078efc98754430e92e51da59eb2563c" :
               gameType === "WINGO3MIN" ? "9078efc98754430e92e51da59eb2563c" :
               gameType === "WINGO5MIN" ? "9078efc98754430e92e51da59eb2563c" :
               "f9ec46840a374a65bb2abad44dfc4dc3";
    } else {
      random = "f9ec46840a374a65bb2abad44dfc4dc3";
    }
    
    endpoint = "GameBetting";
  }
  
  const betBody = {
    typeId: typeId,
    issuenumber: issueNumber,
    language: language,
    gameType: 2,
    amount: unitAmount,
    betCount: betCount,
    selectType: selectType,
    random: random
  };
  
  if (platform === '6LOTTERY') {
    betBody.signature = generateSignature6Lottery(betBody).toUpperCase();
  } else {
    betBody.signature = signMd5Original(betBody).toUpperCase();
  }
  
  betBody.timestamp = Math.floor(Date.now() / 1000);
  
  for (let attempt = 0; attempt < MAX_BET_RETRIES; attempt++) {
    try {
      const response = await session.post(config.BASE_URL + endpoint, betBody, { timeout: BET_API_TIMEOUT });
      const res = response.data;
      log('INFO', `🎯 Bet request for user ${userId}, ${config.GAME_NAME}, ${gameType}, issue ${issueNumber}, select_type ${selectType}, amount ${unitAmount * betCount}`);
      return res;
    } catch (error) {
      log('ERROR', `❌ Bet error for user ${userId}, attempt ${attempt + 1}: ${error.message}`);
      
      if (attempt < MAX_BET_RETRIES - 1) {
        await setTimeout(BET_RETRY_DELAY );
        continue;
      }
      return { error: error.message, code: -1 };
    }
  }
  return { error: "Failed after retries", code: -1 };
};

// 6. Get Game History API
const getGameHistory = async (session, platform) => {
  const config = getPlatformConfig(platform);
  const body = {
    "pageSize": 10,
    "typeId": platform === '6LOTTERY' ? 1 : 30,
    "language": 7,
    "random": "f15bdcc4e6a04f82828b2f7a7b4c6e5a"
  };
  
  if (platform === '6LOTTERY') {
    body.signature = generateSignature6Lottery(body).toUpperCase();
  } else {
    body.signature = signMd5Original(body).toUpperCase();
  }
  
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post(config.BASE_URL + "GetNoaverageEmerdList", body, { timeout: 15000 });
    const data = response.data?.list || [];
    return data.filter(item => item && item.number !== undefined && item.number !== null);
  } catch (error) {
    log('ERROR', `🧨 ERROR fetching game history for ${config.GAME_NAME}: ${error.message}`);
    return [];
  }
};

// ============================================
// 🔥 NEW STRATEGY FUNCTIONS
// ============================================

// 🔥 1. QUANTUM BRAIN Strategy
const getQuantumBrainPrediction = async (userId, platform, gameType = "TRX") => {
  try {
    // Simplified quantum brain logic
    const session = userSessions[userId];
    const history = await getGameHistory(session, platform);
    
    if (history.length < 10) {
      return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
    }
    
    // Get last 10 results
    const lastResults = history.slice(0, 10).map(item => {
      const num = parseInt(item.number.toString(), 10) % 10;
      return num >= 5 ? "B" : "S";
    });
    
    // Analyze patterns
    const bCount = lastResults.filter(r => r === 'B').length;
    const sCount = lastResults.filter(r => r === 'S').length;
    
    // Quantum decision
    let prediction;
    if (Math.abs(bCount - sCount) > 3) {
      prediction = bCount > sCount ? 'S' : 'B'; // Opposite to balance
    } else {
      prediction = Math.random() < 0.5 ? 'B' : 'S';
    }
    
    log('INFO', `🔥 QUANTUM BRAIN: Last 10 results - B:${bCount}, S:${sCount}, Prediction:${prediction}`);
    
    return { result: prediction, percent: "60.0" };
    
  } catch (error) {
    log('ERROR', `🧨 ERROR in QUANTUM BRAIN prediction: ${error.message}`);
    return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
  }
};

// 🔥 2. HYPER DIMENSIONAL Strategy
const getHyperDimensionalPrediction = async (userId, platform, gameType = "TRX") => {
  try {
    // Multi-dimensional analysis
    const session = userSessions[userId];
    const history = await getGameHistory(session, platform);
    
    if (history.length < 15) {
      return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
    }
    
    const lastResults = history.slice(0, 15).map(item => parseInt(item.number.toString(), 10));
    
    // 3D analysis: past, present, future patterns
    const pastAvg = lastResults.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const presentAvg = lastResults.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
    const recentAvg = lastResults.slice(10, 15).reduce((a, b) => a + b, 0) / 5;
    
    let prediction;
    if (presentAvg > pastAvg && recentAvg > presentAvg) {
      prediction = 'B'; // Rising trend
    } else if (presentAvg < pastAvg && recentAvg < presentAvg) {
      prediction = 'S'; // Falling trend
    } else {
      // Random with bias
      const bias = recentAvg > 4.5 ? 0.6 : 0.4;
      prediction = Math.random() < bias ? 'B' : 'S';
    }
    
    log('INFO', `🌌 HYPER DIMENSIONAL: Past:${pastAvg.toFixed(1)}, Present:${presentAvg.toFixed(1)}, Recent:${recentAvg.toFixed(1)}, Prediction:${prediction}`);
    
    return { result: prediction, percent: "65.0" };
    
  } catch (error) {
    log('ERROR', `🧨 ERROR in HYPER DIMENSIONAL prediction: ${error.message}`);
    return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
  }
};

// 🔥 3. API RULE Strategy
const getAPIRulePrediction = async (userId, platform, gameType = "TRX") => {
  try {
    const session = userSessions[userId];
    const history = await getGameHistory(session, platform);
    
    if (history.length < 10) {
      return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
    }
    
    const lastResults = history.slice(0, 10).map(item => parseInt(item.number.toString(), 10));
    
    // API Rule: Sum of last numbers mod analysis
    const sum = lastResults.reduce((a, b) => a + b, 0);
    const avg = sum / lastResults.length;
    
    let prediction;
    if (sum % 2 === 0) {
      prediction = avg > 4.5 ? 'B' : 'S';
    } else {
      prediction = avg <= 4.5 ? 'B' : 'S';
    }
    
    log('INFO', `🎰 API RULE: Sum:${sum}, Avg:${avg.toFixed(1)}, Prediction:${prediction}`);
    
    return { result: prediction, percent: "70.0" };
    
  } catch (error) {
    log('ERROR', `🧨 ERROR in API RULE prediction: ${error.message}`);
    return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
  }
};

// 🔥 4. RNG SYSTEM Strategy
const getRNGSystemPrediction = async (userId, platform, gameType = "TRX") => {
  try {
    // RNG system detection and prediction
    const session = userSessions[userId];
    const history = await getGameHistory(session, platform);
    
    if (history.length < 20) {
      return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
    }
    
    const lastResults = history.slice(0, 20).map(item => parseInt(item.number.toString(), 10));
    
    // Detect RNG patterns
    const patterns = [];
    for (let i = 0; i < lastResults.length - 2; i++) {
      const pattern = [lastResults[i], lastResults[i + 1], lastResults[i + 2]];
      patterns.push(pattern);
    }
    
    // Find most common pattern
    const patternCounts = {};
    patterns.forEach(pattern => {
      const key = pattern.join('-');
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    });
    
    const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
    
    let prediction;
    if (sortedPatterns.length > 0 && sortedPatterns[0][1] >= 3) {
      const bestPattern = sortedPatterns[0][0].split('-').map(Number);
      const nextDigit = (bestPattern[0] + bestPattern[1]) % 10;
      prediction = nextDigit >= 5 ? 'B' : 'S';
    } else {
      // No clear pattern, use weighted random
      const bCount = lastResults.filter(r => r >= 5).length;
      const probability = bCount / lastResults.length;
      prediction = Math.random() < probability ? 'B' : 'S';
    }
    
    log('INFO', `🤖 RNG SYSTEM: Patterns found:${sortedPatterns.length}, Prediction:${prediction}`);
    
    return { result: prediction, percent: "75.0" };
    
  } catch (error) {
    log('ERROR', `🧨 ERROR in RNG SYSTEM prediction: ${error.message}`);
    return { result: Math.random() < 0.5 ? 'B' : 'S', percent: "50.0" };
  }
};

// ============================================
// WIN/LOSE CHECKER WITH TIME START CHECK
// ============================================

const winLoseChecker = async () => {
  log('INFO', "🎮 Win/lose checker started (FAST MODE)");
  
  while (true) {
    try {
      const checkPromises = Object.entries(userSessions).map(async ([userId, session]) => {
        if (!session || isUserBanned(userId)) return;
        
        const settings = userSettings[userId] || {};
        const platform = settings.platform || '777BIGWIN';
        const gameType = settings.game_type || "TRX";
        const config = getPlatformConfig(platform);
        
        if (!userPendingBets[userId] && !userSkippedBets[userId]) return;
        
        try {
          let data;

          if (gameType.includes("WINGO")) {
            const wingoRes = await getWingoGameResults(session, platform, gameType);
            if (!wingoRes || wingoRes.code !== 0) {
              return;
            }
            data = wingoRes.data?.list || [];
          } else {
            let issueRes = await getGameIssueRequest(session, platform, gameType);
            
            if (!issueRes || issueRes.code !== 0) {
              return;
            }
            
            data = issueRes.data?.settled ? [issueRes.data.settled] : [];
          }
          
          if (userPendingBets[userId]) {
            for (const period of Object.keys(userPendingBets[userId])) {
              let settled;
              if (gameType.includes("WINGO")) {
                settled = data.find(item => item.issueNumber === period);
              } else {
                settled = data.find(item => item.issueNumber === period);
              }
              
              if (settled) {
                const [betType, amount, isVirtual] = userPendingBets[userId][period] || [betType, amount, false];
                const number = parseInt(settled.number || "0", 10) % 10;
                const bigSmall = number >= 5 ? "Big" : "Small";
                const isWin = (betType === "B" && bigSmall === "Big") || (betType === "S" && bigSmall === "Small");
                
                userLastResult[userId] = bigSmall;
                
                if (!userSettings[userId].lastPeriod) {
                  userSettings[userId].lastPeriod = {};
                }
                userSettings[userId].lastPeriod[gameType] = period;
                
                const userSettingsForUser = userSettings[userId] || {};
                const bettingStrategy = userSettingsForUser.betting_strategy || "Martingale";
                const slLimit = userSettingsForUser.sl_limit;
                const layerLimit = userSettingsForUser.layer_limit;
                const skipBetting = userSettingsForUser.skip_betting || 
                  (layerLimit !== undefined && layerLimit > 1 && (userSettingsForUser.current_layer || 0) < layerLimit - 1);
                
                log('INFO', `📊 Processing result for user ${userId}, period ${period}, bet_type ${betType}, amount ${amount}, is_win ${isWin}, betting_strategy ${bettingStrategy}, skip_betting ${skipBetting}`);
                
                if (userStats[userId]) {
                  const currentProfit = userStats[userId].profit;
                  
                  if (!skipBetting) {
                    if (isWin) {
                      const profitChange = amount * 0.96;
                      userStats[userId].profit += profitChange;
                      log('INFO', `🏆 Win: Profit increased by ${profitChange.toFixed(2)} MMK to ${userStats[userId].profit.toFixed(2)} MMK`);
                    } else {
                      const profitChange = -amount;
                      userStats[userId].profit += profitChange;
                      log('INFO', `⛔ Loss: Profit decreased by ${Math.abs(profitChange).toFixed(2)} MMK to ${userStats[userId].profit.toFixed(2)} MMK`);
                    }
                  }
                }
                
                const currentBalance = await getBalanceWithRetry(session, platform, userId);
                
                // Update profit message for silent mode
                if (userStats[userId]) {
                  const currentProfit = userStats[userId].profit;
                  updateProfitMessage(userId, userId, currentBalance || 0, currentProfit);
                }
                
                let message;
                if (isWin) {
                  message = formatWinMessage(amount, bigSmall, number, currentBalance || 0, userStats[userId]?.profit || 0);
                } else {
                  message = formatLoseMessage(amount, bigSmall, number, currentBalance || 0, userStats[userId]?.profit || 0);
                }
                
                if (!await sendMessageWithRetry(userId, message)) {
                  log('ERROR', `❌ Failed to send result message to ${userId} after retries`);
                }
                
                const targetProfit = userSettingsForUser.target_profit;
                const stopLoss = userSettingsForUser.stop_loss;
                
                if (userStats[userId]) {
                  const currentProfit = userStats[userId].profit;
                  const startedAmount = userStats[userId].start_balance || 0;
                  
                  if (targetProfit && currentProfit >= targetProfit) {
                    // Send profit target notification with ASCII art
                    await showProfitTargetReached(
                      targetProfit, 
                      currentBalance || 0, 
                      config.GAME_NAME, 
                      userId,
                      startedAmount,
                      currentProfit
                    );
                    
                    userSettingsForUser.running = false;
                    
                  } else if (stopLoss && currentProfit <= -stopLoss) {
                    // Send stop loss notification with ASCII art
                    await showStopLossReached(
                      stopLoss, 
                      currentBalance || 0, 
                      config.GAME_NAME, 
                      userId,
                      startedAmount,
                      currentProfit
                    );
                    
                    userSettingsForUser.running = false;
                  }
                }
                
                if (isWin) {
                  if (userSettingsForUser.skip_betting || 
                      (layerLimit !== undefined && layerLimit > 1 && (userSettingsForUser.current_layer || 0) >= layerLimit - 1)) {
                    userSettingsForUser.skip_betting = false;
                    userSettingsForUser.consecutive_losses = 0;
                    userSettingsForUser.current_layer = 0;
                    log('INFO', `🔄 SL and Layer reset for user ${userId}: Win detected, resuming betting`);
                  } else {
                    userSettingsForUser.consecutive_losses = 0;
                    userSettingsForUser.current_layer = 0;
                  }
                } else {
                  if (layerLimit !== undefined && layerLimit > 1) {
                    userSettingsForUser.current_layer = (userSettingsForUser.current_layer || 0) + 1;
                  }
                  
                  if (!skipBetting && slLimit !== undefined && slLimit > 0) {
                    userSettingsForUser.consecutive_losses = (userSettingsForUser.consecutive_losses || 0) + 1;
                    
                    if (userSettingsForUser.consecutive_losses >= slLimit) {
                      userSettingsForUser.skip_betting = true;
                      log('INFO', `⛔ SL triggered for user ${userId}: ${userSettingsForUser.consecutive_losses} consecutive real losses`);
                    }
                  }
                }
                
                if (!skipBetting) {
                  if (bettingStrategy === "Anti-Martingale") {
                    if (isWin) {
                      userSettingsForUser.martin_index = Math.min(
                        (userSettingsForUser.bet_sizes?.length || 1) - 1,
                        (userSettingsForUser.martin_index || 0) + 1
                      );
                    } else {
                      userSettingsForUser.martin_index = 0;
                    }
                    
                    log('INFO', `📈 Anti-Martingale: martin_index set to ${userSettingsForUser.martin_index} for user ${userId}`);
                  } else if (bettingStrategy === "Martingale") {
                    if (isWin) {
                      userSettingsForUser.martin_index = 0;
                    } else {
                      userSettingsForUser.martin_index = Math.min(
                        (userSettingsForUser.bet_sizes?.length || 1) - 1,
                        (userSettingsForUser.martin_index || 0) + 1
                      );
                    }
                    
                    log('INFO', `📉 Martingale: martin_index set to ${userSettingsForUser.martin_index} for user ${userId}`);
                  } else if (bettingStrategy === "D'Alembert") {
                    const currentUnits = userSettingsForUser.dalembert_units || 1;
                    
                    if (isWin) {
                      userSettingsForUser.dalembert_units = Math.max(1, currentUnits - 1);
                    } else {
                      userSettingsForUser.dalembert_units = currentUnits + 1;
                    }
                    
                    log('INFO', `⚖️ D'Alembert: dalembert_units set to ${userSettingsForUser.dalembert_units} for user ${userId}`);
                  }
                }
                
                delete userPendingBets[userId][period];
                
                if (Object.keys(userPendingBets[userId]).length === 0) {
                  delete userPendingBets[userId];
                }
                
                userWaitingForResult[userId] = false;
                log('INFO', `🎄Result processed for user ${userId}, ${config.GAME_NAME}: ${message}`);
              } else {
                log('DEBUG', `⏳ Pending bet for ${period} not yet settled for user ${userId}, ${config.GAME_NAME}, ${gameType}`);
                
                const betTime = userSettings[userId]?.bet_time?.[period] || Date.now() / 1000;
                
                if (Date.now() / 1000 - betTime > MAX_RESULT_WAIT_TIME / 1000) {
                  log('WARNING', `⚠️ Timeout waiting for result for user ${userId}, period ${period}, ${config.GAME_NAME}, ${gameType}`);
                  
                  delete userPendingBets[userId][period];
                  
                  if (Object.keys(userPendingBets[userId]).length === 0) {
                    delete userPendingBets[userId];
                  }
                  
                  userWaitingForResult[userId] = false;
                }
              }
            }
          }
          
          if (userSkippedBets[userId]) {
            for (const [period, betInfo] of Object.entries(userSkippedBets[userId])) {
              let settled;
              if (gameType.includes("WINGO")) {
                settled = data.find(item => item.issueNumber === period);
              } else {
                settled = data.find(item => item.issueNumber === period);
              }
              
              if (settled && settled.number) {
                const [betType, isVirtual] = betInfo;
                const number = parseInt(settled.number || "0") % 10;
                const bigSmall = number >= 5 ? "B" : "S";
                const isWin = (betType === "B" && bigSmall === "B") || (betType === "S" && bigSmall === "S");
                
                const message = isWin ? 
                  `🟢 𝑾𝑰𝑵 +0 MMK \n🧭 ${config.GAME_NAME}: ${gameType}: ${period} =>${bigSmall === 'B' ? '𝑩' : '𝑺'}•${number}` :
                  `🔴 𝑳𝑶𝑺𝑬 -0 MMK \n🧭 ${config.GAME_NAME}: ${gameType}: ${period} =>${bigSmall === 'B' ? '𝑩' : '𝑺'}•${number}`;
                
                try {
                  await sendMessageWithRetry(userId, message);
                } catch (error) {
                  log('ERROR', `❌ Failed to send virtual result to ${userId}: ${error.message}`);
                }
                
                delete userSkippedBets[userId][period];
                if (Object.keys(userSkippedBets[userId]).length === 0) {
                  delete userSkippedBets[userId];
                }
                if (userSkipResultWait[userId] === period) {
                  delete userSkipResultWait[userId];
                }
              }
            }
          }
        } catch (error) {
          // Silent error for individual user
        }
      });
      
      await Promise.allSettled(checkPromises);
      await setTimeout(WIN_LOSE_CHECK_INTERVAL);
    } catch (error) {
      log('ERROR', `❌ Win/lose checker error: ${error.message}`);
      await setTimeout(5000);
    }
  }
};

// ============================================
// BETTING WORKER - WITH TIME START CHECK
// ============================================

const bettingWorker = async (userId, chatId) => {
  const settings = userSettings[userId] || {};
  const platform = settings.platform || '777BIGWIN';
  const config = getPlatformConfig(platform);
  const session = userSessions[userId];
  const gameType = settings.game_type || "TRX";
  
  if (!settings) {
    log('ERROR', `❌ Betting worker failed for user ${userId}: No settings`);
    await sendMessageWithRetry(chatId, "❌ 𝑷𝒍𝒆𝒂𝒔𝒆 𝒍𝒐𝒈𝒊𝒏 𝒇𝒊𝒓𝒔𝒕");
    
    if (settings) {
      settings.running = false;
    }
    
    return;
  }
  
  if (!session) {
    log('ERROR', `❌ Betting worker failed for user ${userId}: No session`);
    await sendMessageWithRetry(chatId, "❌ 𝑷𝒍𝒆𝒂𝒔𝒆 𝒍𝒐𝒈𝒊𝒏 𝒇𝒊𝒓𝒔𝒕");
    
    if (settings) {
      settings.running = false;
    }
    
    return;
  }
  
  userStats[userId] = {
    start_balance: userStats[userId]?.start_balance || 0.0,
    profit: 0.0
  };
  
  settings.running = true;
  settings.bet_time = {};
  settings.last_issue = null;
  settings.consecutive_errors = 0;
  settings.consecutive_losses = 0;
  settings.current_layer = 0;
  settings.skip_betting = false;
  
  let currentBalance = null;
  
  // Use improved balance check with retry
  currentBalance = await getBalanceWithRetry(session, platform, userId);
  
  if (currentBalance === null) {
    log('ERROR', `❌ Failed to get initial balance for user ${userId}`);
    await sendMessageWithRetry(chatId, "❌ 𝑭𝒂𝒊𝒍𝒆𝒅 𝒕𝒐 𝒄𝒉𝒆𝒄𝒌 𝒃𝒂𝒍𝒂𝒏𝒄𝒆. 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈...");
    settings.running = false;
    return;
  }
  
  // NEW BOT START MESSAGE FORMAT
  const startedBalance = currentBalance;
  const displayBalance = `${(currentBalance ).toFixed(2)} Ks`;
  const strategyDisplay = settings.strategy || "𝑵𝒐𝒕 𝑺𝒆𝒕";
  const bettingStrategyDisplay = settings.betting_strategy || "𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆";
  const profitTargetDisplay = settings.target_profit ? `${settings.target_profit.toFixed(2)} Ks` : "𝑵𝒐𝒕 𝑺𝒆𝒕";
  const stopLossDisplay = settings.stop_loss ? `${settings.stop_loss.toFixed(2)} Ks` : "𝑵𝒐𝒕 𝑺𝒆𝒕";
  
  const startMessage = `
🔋 𝑩𝑶𝑻 𝑨𝑪𝑻𝑰𝑽𝑨𝑻𝑬𝑫

🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}
💳 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${displayBalance}
🎲 𝑮𝒂𝒎𝒆: ${gameType}
🎯 𝑻𝒚𝒑𝒆: 𝑩𝒊𝒈/𝑺𝒎𝒂𝒍𝒍
📚 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚: ${strategyDisplay}
🕹 𝑩𝒆𝒕𝒕𝒊𝒏𝒈: ${bettingStrategyDisplay}
🧧 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕: ${profitTargetDisplay}
🌡️ 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒆 𝑳𝒊𝒎𝒊𝒕: ${stopLossDisplay}
`;
  
  await sendMessageWithRetry(chatId, startMessage, makeMainKeyboard(true, userId));
  
  // Silent mode ဖြစ်ရင် profit message စတင်ဖန်တီးပါ
  if (userSilentMode[userId]) {
    await updateProfitMessage(userId, chatId, currentBalance, 0);
  }
  
  const betSizes = settings.bet_sizes || [];
  if (!betSizes.length) {
    log('ERROR', `❌ No bet sizes set for user ${userId}`);
    await sendMessageWithRetry(chatId, "❌ 𝑵𝒐 𝒃𝒆𝒕 𝒔𝒊𝒛𝒆𝒔 𝒔𝒆𝒕. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝑩𝑬𝑻 𝑺𝑰𝒁𝑬 𝒇𝒊𝒓𝒔𝒕.");
    settings.running = false;
    return;
  }
  
  const minBetAmount = Math.min(...betSizes);
  if (currentBalance < minBetAmount) {
    log('ERROR', `❌ Insufficient balance for user ${userId}: ${currentBalance} < ${minBetAmount}`);
    await sendMessageWithRetry(chatId, "❗ 𝑩𝒂𝒍𝒂𝒏𝒄𝒆 𝒊𝒔 𝒏𝒐𝒕 𝒆𝒏𝒐𝒖𝒈𝒉 𝒇𝒐𝒓 𝑩𝒆𝒕.𝑫𝒆𝒑𝒐𝒔𝒊𝒕 𝒂𝒏𝒅 𝑺𝒕𝒂𝒓𝒕 𝒂𝒈𝒂𝒊𝒏.");
    settings.running = false;
    return;
  }
  
  log('INFO', `🚀 Betting worker started for user ${userId}, settings: ${JSON.stringify(settings)}`);
  
  try {
    while (settings.running) {
      if (!isWithinTimeStart(userId)) {
        log('INFO', `⏰ User ${userId} outside time start windows. Waiting...`);
        await setTimeout(60000);
        continue;
      }
      
      if (userWaitingForResult[userId]) {
        log('DEBUG', `⏳ User ${userId} waiting for result, skipping cycle`);
        await setTimeout(500);
        continue;
      }
      
      if (userSkipResultWait[userId]) {
        await setTimeout(500);
        continue;
      }
      
      // Use improved balance check with retry
      currentBalance = await getBalanceWithRetry(session, platform, userId);
      
      if (!betSizes.length) {
        log('ERROR', `❌ No bet sizes set for user ${userId}`);
        await sendMessageWithRetry(chatId, "❌ 𝑵𝒐 𝒃𝒆𝒕 𝒔𝒊𝒛𝒆𝒔 𝒔𝒆𝒕. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝑩𝑬𝑻 𝑺𝑰𝒁𝑬 𝒇𝒊𝒓𝒔𝒕.");
        settings.running = false;
        break;
      }
      
      if (currentBalance !== null && 
          (settings.skip_betting || 
           (settings.layer_limit !== undefined && settings.layer_limit > 1 && 
            (settings.current_layer || 0) < settings.layer_limit - 1) || 
           currentBalance >= Math.min(...betSizes))) {
        settings.consecutive_errors = 0;
      } else {
        log('ERROR', `❌ Balance check failed for user ${userId}: ${currentBalance}`);
        await sendMessageWithRetry(chatId, "❌ 𝑭𝒂𝒊𝒍𝒆𝒅 𝒕𝒐 𝒄𝒉𝒆𝒄𝒌 𝒃𝒂𝒍𝒂𝒏𝒄𝒆 𝒂𝒇𝒕𝒆𝒓 𝒓𝒆𝒕𝒓𝒊𝒆𝒔. 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈...");
        settings.running = false;
        break;
      }
      
      if (!settings.running) {
        break;
      }
      
      const bettingStrategy = settings.betting_strategy || "Martingale";
      const strategy = settings.strategy || null;
      
      let issueRes;
      
      issueRes = await getGameIssueRequest(session, platform, gameType);
      
      if (!issueRes || issueRes.code !== 0) {
        log('ERROR', `❌ Game issue request failed for user ${userId}, ${config.GAME_NAME}, ${gameType}: ${JSON.stringify(issueRes)}`);
        settings.consecutive_errors += 1;
        
        if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
          log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
          await sendMessageWithRetry(chatId, `❌ 𝑻𝒐𝒐 𝒎𝒂𝒏𝒚 𝒄𝒐𝒏𝒔𝒆𝒄𝒖𝒕𝒊𝒗𝒆 𝒆𝒓𝒓𝒐𝒓𝒔 (${MAX_CONSECUTIVE_ERRORS}). 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈 𝒃𝒐𝒕.`);
          settings.running = false;
          break;
        }
        
        await setTimeout(1000);
        continue;
      }
      
      const data = issueRes.data || {};
      let currentIssue;
      let drawTime;
      
      if (gameType === "TRX") {
        currentIssue = data.predraw?.issueNumber;
        drawTime = data.predraw?.drawTime;
      } else {
        currentIssue = data.issueNumber;
        drawTime = data.drawTime;
      }
      
      if (!currentIssue) {
        log('WARNING', `⚠️ No valid issue number for user ${userId}, ${config.GAME_NAME}, ${gameType}: ${JSON.stringify(data)}`);
        settings.consecutive_errors += 1;
        
        if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
          log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
          await sendMessageWithRetry(chatId, `❌ 𝑻𝒐𝒐 𝒎𝒂𝒏𝒚 𝒄𝒐𝒏𝒔𝒆𝒄𝒖𝒕𝒊𝒗𝒆 𝒆𝒓𝒓𝒐𝒓𝒔 (${MAX_CONSECUTIVE_ERRORS}). 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈 𝒃𝒐𝒕.`);
          settings.running = false;
          break;
        }
        
        await setTimeout(500);
        continue;
      }
      
      if (currentIssue === settings.last_issue) {
        log('DEBUG', `🔄 Same issue ${currentIssue} for user ${userId}, waiting for new issue`);
        await setTimeout(500);
        continue;
      }
      
      if (drawTime) {
        try {
          const drawTimestamp = parseInt(drawTime) / 1000;
          const currentTime = Date.now() / 1000;
          
          if (drawTimestamp <= currentTime + 3) {
            log('WARNING', `⚠️ Issue ${currentIssue} is settled or about to settle (drawTime: ${drawTime}, current: ${currentTime}). Skipping...`);
            settings.last_issue = currentIssue;
            
            if (gameType.includes("WINGO")) {
              await setTimeout(2000);
            } else {
              await setTimeout(5000);
            }
            
            continue;
          }
          
          const remainingTime = drawTimestamp - currentTime;
          if (remainingTime < 2) {
            log('WARNING', `⚠️ Issue ${currentIssue} closing soon (${remainingTime.toFixed(1)}s). Skipping...`);
            settings.last_issue = currentIssue;
            await setTimeout(2000);
            continue;
          }
        } catch (error) {
          log('ERROR', `❌ Invalid drawTime for issue ${currentIssue}: ${drawTime}, error: ${error.message}`);
          settings.consecutive_errors += 1;
          
          if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
            settings.running = false;
            break;
          }
          
          await setTimeout(500);
          continue;
        }
      }
      
      let ch;
      let shouldSkip = false;
      
      if (strategy === "QUANTUM_BRAIN") {
        const prediction = await getQuantumBrainPrediction(userId, platform, gameType);
        if (prediction) {
          ch = prediction.result;
        } else {
          ch = Math.random() < 0.5 ? "B" : "S";
        }
        log('INFO', `🔥 QUANTUM BRAIN: Bet ${ch}`);
      }
      else if (strategy === "HYPER_DIMENSIONAL") {
        const prediction = await getHyperDimensionalPrediction(userId, platform, gameType);
        if (prediction) {
          ch = prediction.result;
        } else {
          ch = Math.random() < 0.5 ? "B" : "S";
        }
        log('INFO', `🌌 HYPER DIMENSIONAL: Bet ${ch}`);
      }
      else if (strategy === "API_RULE") {
        const prediction = await getAPIRulePrediction(userId, platform, gameType);
        if (prediction) {
          ch = prediction.result;
        } else {
          ch = Math.random() < 0.5 ? "B" : "S";
        }
        log('INFO', `🎰 API RULE: Bet ${ch}`);
      }
      else if (strategy === "RNG_SYSTEM") {
        const prediction = await getRNGSystemPrediction(userId, platform, gameType);
        if (prediction) {
          ch = prediction.result;
        } else {
          ch = Math.random() < 0.5 ? "B" : "S";
        }
        log('INFO', `🤖 RNG SYSTEM: Bet ${ch}`);
      }
      else {
        // No strategy selected
        log('ERROR', `❌ No strategy selected for user ${userId}`);
        await sendMessageWithRetry(chatId, "❌ 𝑵𝒐 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒔𝒆𝒍𝒆𝒄𝒕𝒆𝒅. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒍𝒆𝒄𝒕 𝒂 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒊𝒏 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍 → 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚.");
        settings.running = false;
        break;
      }
      
      const selectMap = getSelectMap();
      const selectType = selectMap[ch];
      
      if (selectType === undefined) {
        log('ERROR', `❌ Invalid bet type ${ch} for user ${userId}`);
        settings.consecutive_errors += 1;
        
        if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
          log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
          settings.running = false;
          break;
        }
        
        await setTimeout(1000);
        continue;
      }
      
      if (!betSizes.length) {
        log('ERROR', `❌ No bet sizes set for user ${userId}`);
        await sendMessageWithRetry(chatId, "❌ 𝑵𝒐 𝒃𝒆𝒕 𝒔𝒊𝒛𝒆𝒔 𝒔𝒆𝒕. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝑩𝑬𝑻 𝑺𝑰𝒁𝑬 𝒇𝒊𝒓𝒔𝒕.");
        settings.running = false;
        break;
      }
      
      let amount;
      
      if (bettingStrategy === "D'Alembert") {
        if (betSizes.length > 1) {
          log('ERROR', `❌ D'Alembert requires a single bet size for user ${userId}`);
          await sendMessageWithRetry(chatId, "❌ 𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕 𝒓𝒆𝒒𝒖𝒊𝒓𝒆𝒔 𝒂 𝒔𝒊𝒏𝒈𝒍𝒆 𝑩𝑬𝑻 𝑺𝑰𝒁𝑬. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝒐𝒏𝒆 𝒃𝒆𝒕 𝒔𝒊𝒛𝒆.", makeMainKeyboard(true));
          settings.running = false;
          break;
        }
        
        const unitSize = betSizes[0];
        const units = settings.dalembert_units || 1;
        amount = unitSize * units;
        
        log('INFO', `⚖️ D'Alembert: Using bet size ${amount} MMK (unit_size=${unitSize}, units=${units}) for user ${userId}`);
      } else {
        const midx = Math.min((settings.martin_index || 0), betSizes.length - 1);
        amount = betSizes[midx];
        
        log('INFO', `${bettingStrategy}: Using bet size ${amount} MMK, martin_index=${midx} for user ${userId}`);
      }
      
      const layerLimit = settings.layer_limit;
      const skipBetting = settings.skip_betting || 
        (layerLimit !== undefined && layerLimit > 1 && (settings.current_layer || 0) < layerLimit - 1);
      
      if (!skipBetting && currentBalance < amount) {
        log('ERROR', `❌ Insufficient balance for user ${userId}: ${currentBalance} < ${amount}`);
        await sendMessageWithRetry(chatId, "❗ 𝑩𝒂𝒍𝒂𝒏𝒄𝒆 𝒊𝒔 𝒏𝒐𝒕 𝒆𝒏𝒐𝒖𝒈𝒉 𝒇𝒐𝒓 𝑩𝒆𝒕.𝑫𝒆𝒑𝒐𝒔𝒊𝒕 𝒂𝒏𝒅 𝑺𝒕𝒂𝒓𝒕 𝒂𝒈𝒂𝒊𝒏.");
        settings.running = false;
        break;
      }
      
      const betMsg = formatBetMessage(config, gameType, currentIssue, ch, amount, skipBetting);
      await sendMessageWithRetry(chatId, betMsg);
      
      log('INFO', `${skipBetting ? 'Simulating' : 'Placing'} bet for user ${userId}, ${config.GAME_NAME}, ${gameType}: ${betMsg}`);
      
      if (!skipBetting) {
        const unitAmount = computeUnitAmount(amount);
        const betCount = unitAmount > 0 ? Math.floor(amount / unitAmount) : 1;
        
        const betResp = await placeBetRequest(session, platform, currentIssue, selectType, unitAmount, betCount, gameType, userId);
        settings.last_issue = currentIssue;
        
        if (betResp.settled) {
          log('INFO', `⏭️ Period ${currentIssue} is settled, skipping to next cycle for user ${userId}`);
          await setTimeout(500);
          continue;
        }
        
        if (betResp.error) {
          log('ERROR', `❌ Bet error for user ${userId}, ${config.GAME_NAME}, ${gameType}, issue ${currentIssue}: ${betResp.error}`);
          settings.consecutive_errors += 1;
          
          if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
            await sendMessageWithRetry(chatId, `❌ 𝑻𝒐𝒐 𝒎𝒂𝒏𝒚 𝒄𝒐𝒏𝒔𝒆𝒄𝒖𝒕𝒊𝒗𝒆 𝒆𝒓𝒓𝒐𝒓𝒔 (${MAX_CONSECUTIVE_ERRORS}). 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈 𝒃𝒐𝒕.`);
            settings.running = false;
            break;
          }
          
          await setTimeout(3000);
          continue;
        } else if (betResp.code !== 0) {
          const errorMsg = betResp.msg || "Unknown error";
          log('ERROR', `❌ API error for user ${userId}, ${config.GAME_NAME}, ${gameType}, issue ${currentIssue}: ${errorMsg}`);
          
          if (!errorMsg.toLowerCase().includes("settled")) {
            settings.consecutive_errors += 1;
          }
          
          if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
            await sendMessageWithRetry(chatId, `❌ 𝑻𝒐𝒐 𝒎𝒂𝒏𝒚 𝒄𝒐𝒏𝒔𝒆𝒄𝒖𝒕𝒊𝒗𝒆 𝒆𝒓𝒓𝒐𝒓𝒔 (${MAX_CONSECUTIVE_ERRORS}). 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈 𝒃𝒐𝒕.`);
            settings.running = false;
            break;
          }
          
          await setTimeout(3000);
          continue;
        }
        
        settings.consecutive_errors = 0;
      }
      
      if (!userPendingBets[userId]) {
        userPendingBets[userId] = {};
      }
      
      userPendingBets[userId][currentIssue] = [ch, skipBetting ? 0 : amount, false];
      settings.bet_time[currentIssue] = Date.now() / 1000;
      userWaitingForResult[userId] = true;
      
      log('INFO', `${skipBetting ? 'Simulating' : 'Placed'} bet for user ${userId}, ${config.GAME_NAME}, ${gameType}, waiting for result on issue ${currentIssue}`);
      
      const gameDelay = GAME_DELAYS[gameType] || 1000;
      await setTimeout(gameDelay);
    }
  } catch (error) {
    if (error.name === 'CancelError') {
      log('INFO', `⏹️ Betting worker cancelled for user ${userId}`);
    } else {
      log('ERROR', `❌ Betting worker error for user ${userId}, ${config.GAME_NAME}, ${gameType}: ${error.message}`);
      settings.consecutive_errors += 1;
      
      if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        log('ERROR', `❌ Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached for user ${userId}. Stopping bot.`);
        settings.running = false;
      }
    }
  } finally {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    delete userSkipResultWait[userId];
    
    let currentBalance = null;
    const session = userSessions[userId];
    currentBalance = session ? await getBalanceWithRetry(session, platform, userId) : null;
    
    const balanceText = currentBalance !== null ? `🧩 𝑩𝒂𝒍𝒂𝒏𝒄𝒆: ${(currentBalance ).toFixed(2)} Ks\n📊 𝑻𝒐𝒕𝒂𝒍 𝑷𝒓𝒐𝒇𝒊𝒕: ${userStats[userId] ? (userStats[userId].profit >= 0 ? '+' : '') + userStats[userId].profit.toFixed(2) : 'N/A'} Ks` : '';
    
    await sendMessageWithRetry(chatId, `🛑 𝑩𝒐𝒕 𝑺𝒕𝒐𝒑𝒑𝒆𝒅\n${balanceText}`, makeMainKeyboard(true, userId));
  }
};

// ============================================
// SIMPLIFIED USER AUTHORIZATION CHECK
// ============================================

const checkUserLoggedIn = (userId) => {
  return !!(userSessions[userId] && userSettings[userId]?.platform);
};

// ============================================
// TELEGRAM BOT COMMAND HANDLERS
// ============================================

bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (isUserBanned(userId)) {
    await sendMessageWithRetry(chatId, 
      `🚫 𝒀𝒐𝒖 𝒉𝒂𝒗𝒆 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅 𝒇𝒓𝒐𝒎 𝒖𝒔𝒊𝒏𝒈 𝒕𝒉𝒊𝒔 𝒃𝒐𝒕.\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒇𝒐𝒓 𝒂𝒔𝒔𝒊𝒔𝒕𝒂𝒏𝒄𝒆.`
    );
    return;
  }
  
  log('INFO', `/start command from user ${userId}`);
  
  // Check channel membership first
  const channelResults = await checkChannelMembership(userId);
  const allJoined = channelResults.every(result => result.isMember);
  
  if (!allJoined) {
    // Store verification status
    userState[userId] = { 
      state: "CHANNEL_VERIFICATION",
      channel_results: channelResults 
    };
    
    const joinMessage = createChannelJoinMessage();
    await sendMessageWithRetry(chatId, joinMessage, makeChannelVerifyKeyboard());
    return;
  }
  
  if (!userSettings[userId]) {
    userSettings[userId] = {
      mode: "REAL",
      strategy: null,
      betting_strategy: "Martingale",
      martin_index: 0,
      dalembert_units: 1,
      pattern_index: 0,
      running: false,
      consecutive_losses: 0,
      current_layer: 0,
      skip_betting: false,
      game_type: "TRX",
    };
    
    log('INFO', `🆕 User ${userId} initialized with default settings`);
  }
  
  delete userTemp[userId]?.platform;
  
  if (checkUserLoggedIn(userId)) {
    await sendMessageWithRetry(chatId, 
      `🤖 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 𝑩𝒂𝒄𝒌!\n\n🎮 မင်္ဂလာပါမိတ်ဆွေ အကေညင့်ဝင်ပြီးသားပါ\n\nအောက်က Menu ထဲမှ Buttonများကိုနှိပ်ပါ:`,
      makeMainKeyboard(true, userId)
    );
  } else {
    await sendMessageWithRetry(chatId, formatWelcomeMessage(), makePlatformKeyboard());
  }
  
  if (!global.winLoseTask || global.winLoseTask.finished) {
    global.winLoseTask = winLoseChecker();
  }
});

// Admin command
bot.onText(/\/admin/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  await sendMessageWithRetry(chatId, "🛠️ 𝑨𝒅𝒎𝒊𝒏 𝑪𝒐𝒏𝒕𝒓𝒐𝒍 𝑷𝒂𝒏𝒆𝒍", makeAdminKeyboard());
});

bot.onText(/\/allow (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const parts = match[1].split(' ');
  if (parts.length < 2) {
    await sendMessageWithRetry(chatId, 
      `📋 𝑼𝒔𝒂𝒈𝒆:\n\n/allow {platform} {user_id}\n\n🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔:\n• 777bigwin\n• cklottery\n• 6lottery`
    );
    return;
  }
  
  const platform = parts[0].toUpperCase();
  const userIdToAllow = parseInt(parts[1]);
  
  if (!['777BIGWIN', 'CKLOTTERY', '6LOTTERY'].includes(platform)) {
    await sendMessageWithRetry(chatId, 
      `⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎\n\n𝑽𝒂𝒍𝒊𝒅 𝒑𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔:\n• 777bigwin\n• cklottery\n• 6lottery`
    );
    return;
  }
  
  if (isNaN(userIdToAllow)) {
    await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
    return;
  }
  
  const allowedSet = getAllowedUsersSet(platform);
  const config = getPlatformConfig(platform);
  
  if (allowedSet.has(userIdToAllow)) {
    await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 𝑨𝒍𝒓𝒆𝒂𝒅𝒚 𝑨𝒅𝒅𝒆𝒅\n\n𝑼𝒔𝒆𝒓 ${userIdToAllow} 𝒊𝒔 𝒂𝒍𝒓𝒆𝒂𝒅𝒚 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒇𝒐𝒓 ${config.GAME_NAME}.`);
  } else {
    allowedSet.add(userIdToAllow);
    await saveAllowedUsers(platform);
    await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 𝑨𝒅𝒅𝒆𝒅\n\n𝑼𝒔𝒆𝒓 ${userIdToAllow} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒇𝒐𝒓 ${config.GAME_NAME}.`);
  }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const parts = match[1].split(' ');
  if (parts.length < 2) {
    await sendMessageWithRetry(chatId, 
      `📋 𝑼𝒔𝒂𝒈𝒆:\n\n/remove {platform} {user_id}\n\n🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔:\n• 777bigwin\n• cklottery\n• 6lottery`
    );
    return;
  }
  
  const platform = parts[0].toUpperCase();
  const userIdToRemove = parseInt(parts[1]);
  
  if (!['777BIGWIN', 'CKLOTTERY', '6LOTTERY'].includes(platform)) {
    await sendMessageWithRetry(chatId, 
      `⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎\n\n𝑽𝒂𝒍𝒊𝒅 𝒑𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔:\n• 777bigwin\n• cklottery\n• 6lottery`
    );
    return;
  }
  
  if (isNaN(userIdToRemove)) {
    await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
    return;
  }
  
  const allowedSet = getAllowedUsersSet(platform);
  const config = getPlatformConfig(platform);
  
  if (!allowedSet.has(userIdToRemove)) {
    await sendMessageWithRetry(chatId, `⚠️ 𝑼𝒔𝒆𝒓 𝑵𝒐𝒕 𝑭𝒐𝒖𝒏𝒅\n\n𝑼𝒔𝒆𝒓 ${userIdToRemove} 𝒏𝒐𝒕 𝒇𝒐𝒖𝒏𝒅 𝒊𝒏 ${config.GAME_NAME} 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒍𝒊𝒔𝒕.`);
  } else {
    allowedSet.delete(userIdToRemove);
    await saveAllowedUsers(platform);
    await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 𝑹𝒆𝒎𝒐𝒗𝒆𝒅\n\n𝑼𝒔𝒆𝒓 ${userIdToRemove} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒓𝒆𝒎𝒐𝒗𝒆𝒅 𝒇𝒓𝒐𝒎 ${config.GAME_NAME} 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒍𝒊𝒔𝒕.`);
  }
});

// Channel Management Commands
bot.onText(/\/addchannel (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const args = match[1].split(' ');
  if (args.length < 2) {
    await sendMessageWithRetry(chatId, 
      `📋 𝑼𝒔𝒂𝒈𝒆: /addchannel {channel_id} {channel_name}\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: /addchannel @my_channel "𝑴𝒚 𝑪𝒉𝒂𝒏𝒏𝒆𝒍"`
    );
    return;
  }
  
  const channelId = args[0];
  const channelName = args.slice(1).join(' ');
  
  // Check if channel exists
  try {
    await bot.getChat(channelId);
    
    // Check if already exists
    const exists = requiredChannels.some(ch => ch.id === channelId);
    if (exists) {
      await sendMessageWithRetry(chatId, 
        `⚠️ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑨𝒍𝒓𝒆𝒂𝒅𝒚 𝑬𝒙𝒊𝒔𝒕𝒔\n\n📢 ${channelName}\n🔗 ${channelId}`
      );
      return;
    }
    
    // Add to required channels
    requiredChannels.push({ id: channelId, name: channelName });
    await saveChannelConfig();
    
    await sendMessageWithRetry(chatId, 
      `🎄𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑨𝒅𝒅𝒆𝒅\n\n📢 ${channelName}\n🔗 ${channelId}\n\n𝑻𝒐𝒕𝒂𝒍 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`
    );
  } catch (error) {
    await sendMessageWithRetry(chatId, 
      `❌ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍\n\n𝑴𝒂𝒌𝒆 𝒔𝒖𝒓𝒆:\n1. 𝑩𝒐𝒕 𝒊𝒔 𝒂𝒅𝒎𝒊𝒏 𝒊𝒏 𝒄𝒉𝒂𝒏𝒏𝒆𝒍\n2. 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑰𝑫 𝒊𝒔 𝒄𝒐𝒓𝒓𝒆𝒄𝒕\n3. 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝒊𝒔 𝒑𝒖𝒃𝒍𝒊𝒄`
    );
  }
});

bot.onText(/\/removechannel (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const channelId = match[1].trim();
  
  const initialLength = requiredChannels.length;
  requiredChannels = requiredChannels.filter(ch => ch.id !== channelId);
  
  if (requiredChannels.length < initialLength) {
    await saveChannelConfig();
    await sendMessageWithRetry(chatId, 
      `🎄𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑹𝒆𝒎𝒐𝒗𝒆𝒅\n\n🔗 ${channelId}\n\n𝑹𝒆𝒎𝒂𝒊𝒏𝒊𝒏𝒈 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`
    );
  } else {
    await sendMessageWithRetry(chatId, 
      `⚠️ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑵𝒐𝒕 𝑭𝒐𝒖𝒏𝒅\n\n𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑰𝑫: ${channelId}`
    );
  }
});

bot.onText(/\/listchannels/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  let message = `📢 𝑹𝑬𝑸𝑼𝑰𝑹𝑬𝑫 𝑪𝑯𝑨𝑵𝑵𝑬𝑳𝑺\n\n`;
  
  if (requiredChannels.length === 0) {
    message += `𝑵𝒐 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅.\n𝑼𝒔𝒆 /addchannel 𝒕𝒐 𝒂𝒅𝒅 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔.`;
  } else {
    requiredChannels.forEach((channel, index) => {
      message += `${index + 1}. ${channel.name}\n   🔗 ${channel.id}\n\n`;
    });
    
    message += `\n𝑻𝒐𝒕𝒂𝒍: ${requiredChannels.length} 𝒄𝒉𝒂𝒏𝒏𝒆𝒍(𝒔)`;
  }
  
  await sendMessageWithRetry(chatId, message);
});

// Ban user command
bot.onText(/\/ban (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const username = match[1].trim();
  const userToBan = parseInt(username);
  
  if (isNaN(userToBan)) {
    await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
    return;
  }
  
  await banUser(userToBan, username);
  
  try {
    await sendMessageWithRetry(userToBan, 
      `🚫 𝒀𝒐𝒖 𝒉𝒂𝒗𝒆 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅 𝒇𝒓𝒐𝒎 𝒖𝒔𝒊𝒏𝒈 𝒕𝒉𝒊𝒔 𝒃𝒐𝒕.\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒇𝒐𝒓 𝒂𝒔𝒔𝒊𝒔𝒕𝒂𝒏𝒄𝒆.`
    );
  } catch (error) {
    log('ERROR', `❌ Failed to send ban message to user ${userToBan}: ${error.message}`);
  }
  
  await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 ${userToBan} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅.`);
});

// Unban user command
bot.onText(/\/unban (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const username = match[1].trim();
  const userToUnban = parseInt(username);
  
  if (isNaN(userToUnban)) {
    await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
    return;
  }
  
  if (!isUserBanned(userToUnban)) {
    await sendMessageWithRetry(chatId, `⚠️ 𝑼𝒔𝒆𝒓 ${userToUnban} 𝒊𝒔 𝒏𝒐𝒕 𝒃𝒂𝒏𝒏𝒆𝒅.`);
    return;
  }
  
  await unbanUser(userToUnban);
  
  try {
    await sendMessageWithRetry(userToUnban, 
      `🎄𝒀𝒐𝒖𝒓 𝒃𝒂𝒏 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒍𝒊𝒇𝒕𝒆𝒅!\n\n𝒀𝒐𝒖 𝒄𝒂𝒏 𝒏𝒐𝒘 𝒖𝒔𝒆 𝒕𝒉𝒆 𝒃𝒐𝒕 𝒂𝒈𝒂𝒊𝒏.\n\n𝑻𝒚𝒑𝒆 /start 𝒕𝒐 𝒃𝒆𝒈𝒊𝒏.`
    );
  } catch (error) {
    log('ERROR', `❌ Failed to send unban message to user ${userToUnban}: ${error.message}`);
  }
  
  await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 ${userToUnban} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒖𝒏𝒃𝒂𝒏𝒏𝒆𝒅.`);
});

// Broadcast command
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const message = match[1];
  await broadcastMessage(message, userId);
});

// Stats command
bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const stats = formatUserStats();
  await sendMessageWithRetry(chatId, stats);
});

// Mode command
bot.onText(/\/mode (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
    await sendMessageWithRetry(chatId, "⛔ 𝑨𝒅𝒎𝒊𝒏 𝑶𝒏𝒍𝒚\n\n𝑻𝒉𝒊𝒔 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒊𝒔 𝒓𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒆𝒅 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓𝒔.");
    return;
  }
  
  const mode = match[1].toUpperCase();
  
  if (mode === 'FREE' || mode === 'PREMIUM') {
    await saveSystemMode(mode);
    await sendMessageWithRetry(chatId, 
      `🎄𝑺𝒚𝒔𝒕𝒆𝒎 𝑴𝒐𝒅𝒆 𝑪𝒉𝒂𝒏𝒈𝒆𝒅\n\n𝑵𝒐𝒘 𝒓𝒖𝒏𝒏𝒊𝒏𝒈 𝒊𝒏: ${mode} 𝑴𝑶𝑫𝑬\n\n${mode === 'FREE' ? '🔓 𝑨𝒍𝒍 𝒖𝒔𝒆𝒓𝒔 𝒄𝒂𝒏 𝒂𝒄𝒄𝒆𝒔𝒔' : '🔒 𝑶𝒏𝒍𝒚 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒖𝒔𝒆𝒓𝒔 𝒄𝒂𝒏 𝒂𝒄𝒄𝒆𝒔𝒔'}`
    );
  } else {
    await sendMessageWithRetry(chatId, 
      `⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑴𝒐𝒅𝒆\n\n𝑼𝒔𝒆: /mode FREE 𝒐𝒓 /mode PREMIUM\n\n• 𝑭𝑹𝑬𝑬: 𝑶𝒑𝒆𝒏 𝒇𝒐𝒓 𝒂𝒍𝒍 𝒖𝒔𝒆𝒓𝒔\n• 𝑷𝑹𝑬𝑴𝑰𝑼𝑴: 𝑶𝒏𝒍𝒚 𝒂𝒍𝒍𝒐𝒘𝒆𝒅 𝒖𝒔𝒆𝒓𝒔`
    );
  }
});

// ============================================
// CALLBACK QUERY HANDLER
// ============================================

bot.on('callback_query', async (query) => {
  if (!query || !query.from) {
    log('ERROR', '❌ Invalid callback query received');
    return;
  }
  
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  
  log('INFO', `📨 Callback query received from user ${userId}: ${query.data}`);
  
  if (!userSettings[userId]) {
    userSettings[userId] = {
      mode: "REAL",
      betting_strategy: "Martingale",
      martin_index: 0,
      dalembert_units: 1,
      pattern_index: 0,
      running: false,
      consecutive_losses: 0,
      current_layer: 0,
      skip_betting: false,
      game_type: "TRX",
    };
    
    log('INFO', `🆕 Initialized user_settings for user ${userId} in callback handler`);
  }
  
  try {
    await bot.answerCallbackQuery(query.id);
    
    // Time Start handling
    if (query.data.startsWith("time_start:")) {
      const action = query.data.split(":")[1];
      
      if (action === "add") {
        userState[userId] = { state: "INPUT_TIME_START" };
        await sendMessageWithRetry(chatId, 
          `⏰ 𝑨𝒅𝒅 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕\n\n𝑬𝒏𝒕𝒆𝒓 𝒔𝒕𝒂𝒓𝒕 𝒕𝒊𝒎𝒆 (𝒇𝒐𝒓𝒎𝒂𝒕: 9:00𝒂𝒎 𝒐𝒓 14:30):\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆𝒔:\n• 9:00𝒂𝒎\n• 2:30𝒑𝒎\n• 11:00𝒂𝒎\n• 5:00𝒑𝒎\n\n🎯 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒓𝒖𝒏 𝒇𝒐𝒓 1 𝒉𝒐𝒖𝒓 𝒇𝒓𝒐𝒎 𝒕𝒉𝒊𝒔 𝒕𝒊𝒎𝒆`,
          makeMainKeyboard(true, userId)
        );
      } else if (action === "view") {
        const display = getTimeStartDisplay(userId);
        await sendMessageWithRetry(chatId, display, makeTimeStartKeyboard());
      } else if (action === "clear") {
        const result = clearTimeStarts(userId);
        await sendMessageWithRetry(chatId, result.message, makeTimeStartKeyboard());
      } else if (action === "back") {
        await sendMessageWithRetry(chatId, "🔙 𝑹𝒆𝒕𝒖𝒓𝒏𝒊𝒏𝒈 𝒕𝒐 𝒎𝒂𝒊𝒏 𝒎𝒆𝒏𝒖...", makeMainKeyboard(true, userId));
      }
      
      await bot.deleteMessage(chatId, query.message.message_id);
    }
    else if (query.data.startsWith("admin:")) {
      const action = query.data.split(":")[1];
      
      if (action === "stats") {
        const stats = formatUserStats();
        await sendMessageWithRetry(chatId, stats);
      } else if (action === "broadcast") {
        userState[userId] = { state: "ADMIN_BROADCAST" };
        await sendMessageWithRetry(chatId, 
          `📢 𝑺𝒆𝒏𝒅 𝑩𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕 𝑴𝒆𝒔𝒔𝒂𝒈𝒆\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒆𝒏𝒕𝒆𝒓 𝒕𝒉𝒆 𝒎𝒆𝒔𝒔𝒂𝒈𝒆 𝒚𝒐𝒖 𝒘𝒂𝒏𝒕 𝒕𝒐 𝒃𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕 𝒕𝒐 𝒂𝒍𝒍 𝒖𝒔𝒆𝒓𝒔:`
        );
      } else if (action === "ban") {
        userState[userId] = { state: "ADMIN_BAN_USER" };
        await sendMessageWithRetry(chatId, 
          `🚫 𝑩𝒂𝒏 𝑼𝒔𝒆𝒓\n\n𝑬𝒏𝒕𝒆𝒓 𝒕𝒉𝒆 𝒖𝒔𝒆𝒓 𝑰𝑫 𝒕𝒐 𝒃𝒂𝒏:\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: 123456789`
        );
      } else if (action === "unban") {
        userState[userId] = { state: "ADMIN_UNBAN_USER" };
        await sendMessageWithRetry(chatId, 
          `🎄𝑼𝒏𝒃𝒂𝒏 𝑼𝒔𝒆𝒓\n\n𝑬𝒏𝒕𝒆𝒓 𝒕𝒉𝒆 𝒖𝒔𝒆𝒓 𝑰𝑫 𝒕𝒐 𝒖𝒏𝒃𝒂𝒏:\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: 123456789`
        );
      } else if (action === "channels") {
        await sendMessageWithRetry(chatId, "📢 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑴𝒂𝒏𝒂𝒈𝒆𝒎𝒆𝒏𝒕", makeChannelManagementKeyboard());
      } else if (action === "mode_free") {
        await saveSystemMode('FREE');
        await sendMessageWithRetry(chatId, 
          `🎄𝑺𝒚𝒔𝒕𝒆𝒎 𝑴𝒐𝒅𝒆 𝑪𝒉𝒂𝒏𝒈𝒆𝒅\n\n𝑵𝒐𝒘 𝒓𝒖𝒏𝒏𝒊𝒏𝒈 𝒊𝒏: 🔓 𝑭𝑹𝑬𝑬 𝑴𝑶𝑫𝑬\n\n𝑨𝒍𝒍 𝒖𝒔𝒆𝒓𝒔 𝒄𝒂𝒏 𝒂𝒄𝒄𝒆𝒔𝒔 𝒕𝒉𝒆 𝒃𝒐𝒕`
        );
        await bot.deleteMessage(chatId, query.message.message_id);
      } else if (action === "mode_premium") {
        await saveSystemMode('PREMIUM');
        await sendMessageWithRetry(chatId, 
          `🎄𝑺𝒚𝒔𝒕𝒆𝒎 𝑴𝒐𝒅𝒆 𝑪𝒉𝒂𝒏𝒈𝒆𝒅\n\n𝑵𝒐𝒘 𝒓𝒖𝒏𝒏𝒊𝒏𝒈 𝒊𝒏: 🔒 𝑷𝑹𝑬𝑴𝑰𝑼𝑴 𝑴𝑶𝑫𝑬\n\n𝑶𝒏𝒍𝒚 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆𝒅 𝒖𝒔𝒆𝒓𝒔 𝒄𝒂𝒏 𝒂𝒄𝒄𝒆𝒔𝒔`
        );
        await bot.deleteMessage(chatId, query.message.message_id);
      } else if (action === "back") {
        await sendMessageWithRetry(chatId, "🔙 𝑹𝒆𝒕𝒖𝒓𝒏𝒊𝒏𝒈 𝒕𝒐 𝒂𝒅𝒎𝒊𝒏 𝒑𝒂𝒏𝒆𝒍...", makeAdminKeyboard());
      }
      
      await bot.deleteMessage(chatId, query.message.message_id);
    } 
    else if (query.data.startsWith("channel:")) {
      const action = query.data.split(":")[1];
      
      if (action === "add") {
        userState[userId] = { state: "ADMIN_ADD_CHANNEL" };
        await sendMessageWithRetry(chatId, 
          `➕ 𝑨𝒅𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍\n\n𝑺𝒆𝒏𝒅 𝒄𝒉𝒂𝒏𝒏𝒆𝒍 𝒊𝒏𝒇𝒐 𝒊𝒏 𝒕𝒉𝒊𝒔 𝒇𝒐𝒓𝒎𝒂𝒕:\n\n@𝒄𝒉𝒂𝒏𝒏𝒆𝒍_𝒊𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑵𝒂𝒎𝒆\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆:\n@DOLIVERjackoffical 𝑫𝑶𝑳𝑰𝑽𝑬𝑹, {𝑱𝑨𝑪𝑲),TRX,,CHANNEL🏆🏆`
        );
      } else if (action === "remove") {
        userState[userId] = { state: "ADMIN_REMOVE_CHANNEL" };
        
        let channelList = "🗑️ 𝑹𝒆𝒎𝒐𝒗𝒆 𝑪𝒉𝒂𝒏𝒏𝒆𝒍\n\n𝑪𝒖𝒓𝒓𝒆𝒏𝒕 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔:\n\n";
        requiredChannels.forEach((channel, index) => {
          channelList += `${index + 1}. ${channel.name}\n   🔗 ${channel.id}\n\n`;
        });
        
        channelList += `\n𝑬𝒏𝒕𝒆𝒓 𝒄𝒉𝒂𝒏𝒏𝒆𝒍 𝑰𝑫 𝒕𝒐 𝒓𝒆𝒎𝒐𝒗𝒆:\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: @DevMickChannel`;
        
        await sendMessageWithRetry(chatId, channelList);
      } else if (action === "list") {
        let message = `📋 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑳𝒊𝒔𝒕\n\n`;
        
        if (requiredChannels.length === 0) {
          message += `𝑵𝒐 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅.`;
        } else {
          requiredChannels.forEach((channel, index) => {
            message += `${index + 1}. ${channel.name}\n   🔗 ${channel.id}\n\n`;
          });
          
          message += `\n𝑻𝒐𝒕𝒂𝒍: ${requiredChannels.length} 𝒄𝒉𝒂𝒏𝒏𝒆𝒍(𝒔)`;
        }
        
        await sendMessageWithRetry(chatId, message, makeChannelManagementKeyboard());
      }
      
      await bot.deleteMessage(chatId, query.message.message_id);
    }
    else if (query.data.startsWith("sl_limit:")) {
      const slLimit = parseInt(query.data.split(":")[1]);
      userSettings[userId].sl_limit = slLimit > 0 ? slLimit : null;
      userSettings[userId].consecutive_losses = 0;
      userSettings[userId].skip_betting = false;
      await sendMessageWithRetry(chatId, `🎄𝑺𝑳 𝒔𝒆𝒕: ${slLimit > 0 ? slLimit : '𝑫𝒊𝒔𝒂𝒃𝒍𝒆𝒅'} 𝒄𝒐𝒏𝒔𝒆𝒄𝒖𝒕𝒊𝒗𝒆 𝒍𝒐𝒔𝒔𝒆𝒔`, makeRiskControlKeyboard());
      await bot.deleteMessage(chatId, query.message.message_id);
    } else if (query.data.startsWith("layer_limit:")) {
      const layerLimit = parseInt(query.data.split(":")[1]);
      userSettings[userId].layer_limit = layerLimit > 0 ? layerLimit : null;
      userSettings[userId].current_layer = 0;
      userSettings[userId].skip_betting = false;
      await sendMessageWithRetry(chatId, `🎄𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓 𝒔𝒆𝒕: ${layerLimit > 0 ? layerLimit : '𝑫𝒊𝒔𝒂𝒃𝒍𝒆𝒅'} 𝒎𝒂𝒕𝒄𝒉𝒆𝒔`, makeRiskControlKeyboard());
      await bot.deleteMessage(chatId, query.message.message_id);
    }
    else if (query.data === "verify_channels" || query.data === "check_channels") {
      const userId = query.from.id;
      const chatId = query.message.chat.id;
      
      await bot.answerCallbackQuery(query.id, { text: "🔍 𝑪𝒉𝒆𝒄𝒌𝒊𝒏𝒈 𝒄𝒉𝒂𝒏𝒏𝒆𝒍 𝒎𝒆𝒎𝒃𝒆𝒓𝒔𝒉𝒊𝒑..." });
      
      const channelResults = await checkChannelMembership(userId);
      const allJoined = channelResults.every(result => result.isMember);
      
      if (allJoined) {
        // Delete verification message
        await bot.deleteMessage(chatId, query.message.message_id);
        
        // Send welcome message
        await sendMessageWithRetry(chatId,
          `🎄𝑪𝑯𝑨𝑵𝑵𝑬𝑳 𝑽𝑬𝑹𝑰𝑭𝑰𝑪𝑨𝑻𝑰𝑶𝑵 𝑺𝑼𝑪𝑪𝑬𝑺𝑺𝑭𝑼𝑳!\n\n` +
          `🎉 𝑪𝒐𝒏𝒈𝒓𝒂𝒕𝒖𝒍𝒂𝒕𝒊𝒐𝒏𝒔! 𝒀𝒐𝒖 𝒉𝒂𝒗𝒆 𝒋𝒐𝒊𝒏𝒆𝒅 𝒂𝒍𝒍 𝒓𝒆𝒒𝒖𝒊𝒓𝒆𝒅 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔.\n\n` +
          `👉 𝑵𝒐𝒘 𝒔𝒆𝒍𝒆𝒄𝒕 𝒚𝒐𝒖𝒓 𝒑𝒍𝒂𝒕𝒇𝒐𝒓𝒎 𝒕𝒐 𝒄𝒐𝒏𝒕𝒊𝒏𝒖𝒆:`,
          makePlatformKeyboard()
        );
        
        // Clear verification state
        delete userState[userId];
      } else {
        // Update message with current status
        let statusMessage = `📢 𝑪𝑯𝑨𝑵𝑵𝑬𝑳 𝑱𝑶𝑰𝑵 𝑺𝑻𝑨𝑻𝑼𝑺\n\n`;
        
        channelResults.forEach((result, index) => {
          const status = result.isMember ? "🎄𝑱𝒐𝒊𝒏𝒆𝒅" : "❌ 𝑵𝒐𝒕 𝑱𝒐𝒊𝒏𝒆𝒅";
          statusMessage += `${index + 1}. ${result.channel.name}: ${status}\n`;
        });
        
        statusMessage += `\n⚠️ 𝑷𝒍𝒆𝒂𝒔𝒆 𝒋𝒐𝒊𝒏 𝒂𝒍𝒍 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔 𝒂𝒏𝒅 𝒄𝒍𝒊𝒄𝒌 "🔄 𝑪𝒉𝒆𝒄𝒌 𝑨𝒈𝒂𝒊𝒏"`;
        
        await bot.editMessageText(statusMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: makeChannelVerifyKeyboard()
        });
      }
    }
  } catch (error) {
    log('ERROR', `🧨 ERROR handling callback query for user ${userId}: ${error.message}`);
  }
});

// ============================================
// MESSAGE HANDLER - WITH NEW MENUS
// ============================================

bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }
  
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const rawText = msg.text || "";
  const text = normalizeText(rawText);
  
  log('INFO', `📨 Message from user ${userId}: ${rawText}`);
  
  if (isUserBanned(userId)) {
    await sendMessageWithRetry(chatId, 
      `🚫 𝒀𝒐𝒖 𝒉𝒂𝒗𝒆 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅 𝒇𝒓𝒐𝒎 𝒖𝒔𝒊𝒏𝒈 𝒕𝒉𝒊𝒔 𝒃𝒐𝒕.\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒇𝒐𝒓 𝒂𝒔𝒔𝒊𝒔𝒕𝒂𝒏𝒄𝒆.`
    );
    return;
  }
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const command = text.toUpperCase().replace(/[_\s\/\(\)]/g, '').replace('🔐', '');
  
  // Handle admin states first
  if (userId === ADMIN_ID) {
    const currentState = userState[userId]?.state;
    
    if (currentState === "ADMIN_ADD_CHANNEL") {
      const args = rawText.split(' ');
      if (args.length < 2) {
        await sendMessageWithRetry(chatId, 
          `❌ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝒇𝒐𝒓𝒎𝒂𝒕\n\n𝑼𝒔𝒆: @𝒄𝒉𝒂𝒏𝒏𝒆𝒍_𝒊𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑵𝒂𝒎𝒆\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: @DOLIVERjackoffical 𝑫𝑶𝑳𝑰𝑽𝑬𝑹, {𝑱𝑨𝑪𝑲),TRX,,CHANNEL🏆🏆`
        );
        return;
      }
      
      const channelId = args[0];
      const channelName = args.slice(1).join(' ');
      
      try {
        await bot.getChat(channelId);
        
        // Check if already exists
        const exists = requiredChannels.some(ch => ch.id === channelId);
        if (exists) {
          await sendMessageWithRetry(chatId, 
            `⚠️ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑨𝒍𝒓𝒆𝒂𝒅𝒚 𝑬𝒙𝒊𝒔𝒕𝒔\n\n📢 ${channelName}\n🔗 ${channelId}`
          );
        } else {
          requiredChannels.push({ id: channelId, name: channelName });
          await saveChannelConfig();
          
          await sendMessageWithRetry(chatId, 
            `🎄𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑨𝒅𝒅𝒆𝒅\n\n📢 ${channelName}\n🔗 ${channelId}\n\n𝑻𝒐𝒕𝒂𝒍 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`,
            makeChannelManagementKeyboard()
          );
        }
      } catch (error) {
        await sendMessageWithRetry(chatId, 
          `❌ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍\n\n𝑴𝒂𝒌𝒆 𝒔𝒖𝒓𝒆:\n1. 𝑩𝒐𝒕 𝒊𝒔 𝒂𝒅𝒎𝒊𝒏 𝒊𝒏 𝒄𝒉𝒂𝒏𝒏𝒆𝒍\n2. 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑰𝑫 𝒊𝒔 𝒄𝒐𝒓𝒓𝒆𝒄𝒕\n3. 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝒊𝒔 𝒑𝒖𝒃𝒍𝒊𝒄`
        );
      }
      
      delete userState[userId];
      return;
    } 
    else if (currentState === "ADMIN_REMOVE_CHANNEL") {
      const channelId = rawText.trim();
      
      const initialLength = requiredChannels.length;
      requiredChannels = requiredChannels.filter(ch => ch.id !== channelId);
      
      if (requiredChannels.length < initialLength) {
        await saveChannelConfig();
        await sendMessageWithRetry(chatId, 
          `🎄𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑹𝒆𝒎𝒐𝒗𝒆𝒅\n\n🔗 ${channelId}\n\n𝑹𝒆𝒎𝒂𝒊𝒏𝒊𝒏𝒈 𝒄𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`,
          makeChannelManagementKeyboard()
        );
      } else {
        await sendMessageWithRetry(chatId, 
          `⚠️ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑵𝒐𝒕 𝑭𝒐𝒖𝒏𝒅\n\n𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑰𝑫: ${channelId}`
        );
      }
      
      delete userState[userId];
      return;
    }
  }
  
  // Channel verification state
  const currentState = userState[userId]?.state;
  if (currentState === "CHANNEL_VERIFICATION") {
    // User is in verification state, only allow verification
    await sendMessageWithRetry(chatId,
      `📢 𝑷𝒍𝒆𝒂𝒔𝒆 𝒄𝒐𝒎𝒑𝒍𝒆𝒕𝒆 𝒄𝒉𝒂𝒏𝒏𝒆𝒍 𝒗𝒆𝒓𝒊𝒇𝒊𝒄𝒂𝒕𝒊𝒐𝒏 𝒇𝒊𝒓𝒔𝒕.\n\n𝑼𝒔𝒆 𝒕𝒉𝒆 𝒃𝒖𝒕𝒕𝒐𝒏𝒔 𝒊𝒏 𝒕𝒉𝒆 𝒗𝒆𝒓𝒊𝒇𝒊𝒄𝒂𝒕𝒊𝒐𝒏 𝒎𝒆𝒔𝒔𝒂𝒈𝒆.`
    );
    return;
  }
  
  // Platform selection
  if (text.includes("777 BIGWIN") || text === "🎰 𝟕𝟕𝟕 𝑩𝑰𝑮𝑾𝑰𝑵") {
    userTemp[userId] = { platform: '777BIGWIN' };
    const config = getPlatformConfig('777BIGWIN');
    await sendMessageWithRetry(chatId, formatLoginMessage('777BIGWIN', config.GAME_NAME), makeLoginKeyboard());
    return;
  }
  
  if (text.includes("CK LOTTERY") || text === "🎲 𝑪𝑲 𝑳𝑶𝑻𝑻𝑬𝑹𝒀") {
    userTemp[userId] = { platform: 'CKLOTTERY' };
    const config = getPlatformConfig('CKLOTTERY');
    await sendMessageWithRetry(chatId, formatLoginMessage('CKLOTTERY', config.GAME_NAME), makeLoginKeyboard());
    return;
  }
  
  if (text.includes("6 LOTTERY") || text === "🎯 𝟔 𝑳𝑶𝑻𝑻𝑬𝑹𝒀") {
    userTemp[userId] = { platform: '6LOTTERY' };
    const config = getPlatformConfig('6LOTTERY');
    await sendMessageWithRetry(chatId, formatLoginMessage('6LOTTERY', config.GAME_NAME), makeLoginKeyboard());
    return;
  }
  
  // Time start input handling
  if (currentState === "INPUT_TIME_START") {
    const startTime = text.trim();
    
    const result = addTimeStart(userId, startTime);
    
    if (result.success) {
      const display = getTimeStartDisplay(userId);
      await sendMessageWithRetry(chatId, 
        `🎄${result.message}\n\n${display}`,
        makeTimeStartKeyboard()
      );
    } else {
      await sendMessageWithRetry(chatId, 
        `❌ ${result.message}\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏.`,
        makeTimeStartKeyboard()
      );
    }
    
    delete userState[userId];
    return;
  }
  
  // Admin state handling
  if (userId === ADMIN_ID) {
    const currentState = userState[userId]?.state;
    
    if (currentState === "ADMIN_BROADCAST") {
      await broadcastMessage(text, userId);
      delete userState[userId];
      return;
    } else if (currentState === "ADMIN_BAN_USER") {
      const userToBan = parseInt(text);
      
      if (isNaN(userToBan)) {
        await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
        return;
      }
      
      await banUser(userToBan, text);
      
      try {
        await sendMessageWithRetry(userToBan, 
          `🚫 𝒀𝒐𝒖 𝒉𝒂𝒗𝒆 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅 𝒇𝒓𝒐𝒎 𝒖𝒔𝒊𝒏𝒈 𝒕𝒉𝒊𝒔 𝒃𝒐𝒕.\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒇𝒐𝒓 𝒂𝒔𝒔𝒊𝒔𝒕𝒂𝒏𝒄𝒆.`
        );
      } catch (error) {
        log('ERROR', `❌ Failed to send ban message to user ${userToBan}: ${error.message}`);
      }
      
      await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 ${userToBan} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒃𝒂𝒏𝒏𝒆𝒅.`);
      delete userState[userId];
      return;
    } else if (currentState === "ADMIN_UNBAN_USER") {
      const userToUnban = parseInt(text);
      
      if (isNaN(userToUnban)) {
        await sendMessageWithRetry(chatId, "⚠️ 𝑰𝒏𝒗𝒂𝒍𝒊𝒅 𝑼𝒔𝒆𝒓 𝑰𝑫\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒑𝒓𝒐𝒗𝒊𝒅𝒆 𝒂 𝒗𝒂𝒍𝒊𝒅 𝒏𝒖𝒎𝒆𝒓𝒊𝒄 𝒖𝒔𝒆𝒓 𝑰𝑫.");
        return;
      }
      
      if (!isUserBanned(userToUnban)) {
        await sendMessageWithRetry(chatId, `⚠️ 𝑼𝒔𝒆𝒓 ${userToUnban} 𝒊𝒔 𝒏𝒐𝒕 𝒃𝒂𝒏𝒏𝒆𝒅.`);
        delete userState[userId];
        return;
      }
      
      await unbanUser(userToUnban);
      
      try {
        await sendMessageWithRetry(userToUnban, 
          `🎄𝒀𝒐𝒖𝒓 𝒃𝒂𝒏 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒍𝒊𝒇𝒕𝒆𝒅!\n\n𝒀𝒐𝒖 𝒄𝒂𝒏 𝒏𝒐𝒘 𝒖𝒔𝒆 𝒕𝒉𝒆 𝒃𝒐𝒕 𝒂𝒈𝒂𝒊𝒏.\n\n𝑻𝒚𝒑𝒆 /start 𝒕𝒐 𝒃𝒆𝒈𝒊𝒏.`
        );
      } catch (error) {
        log('ERROR', `❌ Failed to send unban message to user ${userToUnban}: ${error.message}`);
      }
      
      await sendMessageWithRetry(chatId, `🎄𝑼𝒔𝒆𝒓 ${userToUnban} 𝒉𝒂𝒔 𝒃𝒆𝒆𝒏 𝒖𝒏𝒃𝒂𝒏𝒏𝒆𝒅.`);
      delete userState[userId];
      return;
    }
  }
  
  // Login handling
  if (command === "LOGIN" || (lines.length > 0 && lines[0].toLowerCase() === "login")) {
    if (!userTemp[userId]?.platform) {
      await sendMessageWithRetry(chatId, formatWelcomeMessage(), makePlatformKeyboard());
      return;
    }
    
    const platform = userTemp[userId].platform;
    const config = getPlatformConfig(platform);
    
    if (lines.length >= 3 && lines[0].toLowerCase() === "login") {
      const username = lines[1];
      const password = lines[2];
      
      log('INFO', `🔐 Processing login for user ${userId} on ${config.GAME_NAME}: username=${username}`);
      await sendMessageWithRetry(chatId, "🔍 𝑪𝒉𝒆𝒄𝒌𝒊𝒏𝒈 𝒍𝒐𝒈𝒊𝒏...");
      
      const [res, session] = await loginRequest(platform, username, password);
      
      if (session) {
        const userInfo = await getUserInfo(session, platform, userId);
        
        if (userInfo && userInfo.user_id) {
          const gameUserId = userInfo.user_id;
          
          const isAuthorized = checkUserAuthorization(platform, gameUserId);
          
          if (!isAuthorized) {
            log('WARNING', `🐦‍🔥Unauthorized login attempt for user ${userId}, game ID ${gameUserId} on ${config.GAME_NAME} in PREMIUM MODE`);
            await sendMessageWithRetry(chatId, 
              `🐦‍🔥𝑨𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒂𝒕𝒊𝒐𝒏 𝑹𝒆𝒒𝒖𝒊𝒓𝒆𝒅\n\n🔒 𝑼𝒔𝒆𝒓 𝑰𝑫: ${gameUserId}\n🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒕𝒐 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆 𝒚𝒐𝒖𝒓 𝑰𝑫`,
              makeLoginKeyboard()
            );
            return;
          }
          
          userSessions[userId] = session;
          userGameInfo[userId] = userInfo;
          userTemp[userId] = { password, platform };
          
          if (!userSettings[userId]) {
            userSettings[userId] = {
              platform: platform,
              mode: "REAL",
              strategy: null,
              betting_strategy: "Martingale",
              martin_index: 0,
              dalembert_units: 1,
              pattern_index: 0,
              running: false,
              consecutive_losses: 0,
              current_layer: 0,
              skip_betting: false,
              game_type: platform === '6LOTTERY' ? "WINGO30S" : "TRX",
            };
          } else {
            userSettings[userId].platform = platform;
            if (platform === '6LOTTERY' && !userSettings[userId].game_type) {
              userSettings[userId].game_type = "WINGO30S";
            }
          }
          
          const balance = await getBalanceWithRetry(session, platform, userId);
          userStats[userId] = { start_balance: parseFloat(balance || 0), profit: 0.0 };
          
          const balanceDisplay = balance !== null ? balance : 0.0;
          await sendMessageWithRetry(chatId, formatLoginSuccess(config, userInfo, balanceDisplay), makeMainKeyboard(true, userId));
        } else {
          await sendMessageWithRetry(chatId, 
            `❌ 𝑳𝒐𝒈𝒊𝒏 𝑭𝒂𝒊𝒍𝒆𝒅\n\n𝑼𝒏𝒂𝒃𝒍𝒆 𝒕𝒐 𝒓𝒆𝒕𝒓𝒊𝒆𝒗𝒆 𝒖𝒔𝒆𝒓 𝒊𝒏𝒇𝒐𝒓𝒎𝒂𝒕𝒊𝒐𝒏.\n\n🔑 𝑷𝒍𝒆𝒂𝒔𝒆 𝒄𝒉𝒆𝒄𝒌 𝒚𝒐𝒖𝒓 𝒄𝒓𝒆𝒅𝒆𝒏𝒕𝒊𝒂𝒍𝒔 𝒂𝒏𝒅 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏`,
            makeLoginKeyboard()
          );
        }
      } else {
        const errorMsg = res.msg || "Login failed";
        await sendMessageWithRetry(chatId, 
          `❌ 𝑳𝒐𝒈𝒊𝒏 𝑬𝒓𝒓𝒐𝒓\n\n${errorMsg}\n\n🔑 𝑷𝒍𝒆𝒂𝒔𝒆 𝒄𝒉𝒆𝒄𝒌 𝒚𝒐𝒖𝒓 𝒄𝒓𝒆𝒅𝒆𝒏𝒕𝒊𝒂𝒍𝒔 𝒂𝒏𝒅 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏`,
            makeLoginKeyboard()
        );
      }
      
      delete userState[userId];
      return;
    }
    
    if (lines.length === 1 && lines[0].toLowerCase() === "login") {
      userState[userId] = { state: "WAIT_PHONE" };
      await sendMessageWithRetry(chatId, 
        `📱 𝑬𝒏𝒕𝒆𝒓 𝑷𝒉𝒐𝒏𝒆 𝑵𝒖𝒎𝒃𝒆𝒓\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒆𝒏𝒕𝒆𝒓 𝒚𝒐𝒖𝒓 𝒑𝒉𝒐𝒏𝒆 𝒏𝒖𝒎𝒃𝒆𝒓 (𝒘𝒊𝒕𝒉𝒐𝒖𝒕 𝒄𝒐𝒖𝒏𝒕𝒓𝒚 𝒄𝒐𝒅𝒆):\n\n09123456789\n\n⚠️ 𝑫𝒐 𝒏𝒐𝒕 𝒊𝒏𝒄𝒍𝒖𝒅𝒆 𝒕𝒉𝒆 "95" 𝒑𝒓𝒆𝒇𝒊𝒙`
      );
      return;
    }
    
    if (userState[userId]?.state === "WAIT_PHONE") {
      userTemp[userId] = { ...userTemp[userId], phone: text };
      userState[userId] = { state: "WAIT_PASS" };
      await sendMessageWithRetry(chatId, 
        `🔐 𝑬𝒏𝒕𝒆𝒓 𝑷𝒂𝒔𝒔𝒘𝒐𝒓𝒅\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒆𝒏𝒕𝒆𝒓 𝒚𝒐𝒖𝒓 𝒑𝒂𝒔𝒔𝒘𝒐𝒓𝒅:`
      );
      return;
    }
    
    if (userState[userId]?.state === "WAIT_PASS") {
      const platform = userTemp[userId]?.platform;
      const phone = userTemp[userId]?.phone;
      const password = text;
      
      if (!platform) {
        await sendMessageWithRetry(chatId, formatWelcomeMessage(), makePlatformKeyboard());
        return;
      }
      
      const config = getPlatformConfig(platform);
      log('INFO', `🔐 Processing login for user ${userId} on ${config.GAME_NAME}: username=${phone}`);
      await sendMessageWithRetry(chatId, "🔍 𝑪𝒉𝒆𝒄𝒌𝒊𝒏𝒈 𝒍𝒐𝒈𝒊𝒏...");
      
      const [res, session] = await loginRequest(platform, phone, password);
      
      if (session) {
        const userInfo = await getUserInfo(session, platform, userId);
        
        if (userInfo && userInfo.user_id) {
          const gameUserId = userInfo.user_id;
          
          const isAuthorized = checkUserAuthorization(platform, gameUserId);
          
          if (!isAuthorized) {
            log('WARNING', `🐦‍🔥Unauthorized login attempt for user ${userId}, game ID ${gameUserId} on ${config.GAME_NAME} in PREMIUM MODE`);
            await sendMessageWithRetry(chatId, 
              `🐦‍🔥𝑨𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒂𝒕𝒊𝒐𝒏 𝑹𝒆𝒒𝒖𝒊𝒓𝒆𝒅\n\n🔒 𝑼𝒔𝒆𝒓 𝑰𝑫: ${gameUserId}\n🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎: ${config.GAME_NAME}\n\n📞 𝑪𝒐𝒏𝒕𝒂𝒄𝒕 𝒂𝒅𝒎𝒊𝒏 @kiki20251 𝒕𝒐 𝒂𝒖𝒕𝒉𝒐𝒓𝒊𝒛𝒆 𝒚𝒐𝒖𝒓 𝑰𝑫`,
              makeLoginKeyboard()
            );
            return;
          }
          
          userSessions[userId] = session;
          userGameInfo[userId] = userInfo;
          userTemp[userId] = { password, platform };
          
          if (!userSettings[userId]) {
            userSettings[userId] = {
              platform: platform,
              mode: "REAL",
              strategy: null,
              betting_strategy: "Martingale",
              martin_index: 0,
              dalembert_units: 1,
              pattern_index: 0,
              running: false,
              consecutive_losses: 0,
              current_layer: 0,
              skip_betting: false,
              game_type: platform === '6LOTTERY' ? "WINGO30S" : "TRX",
            };
          } else {
            userSettings[userId].platform = platform;
            if (platform === '6LOTTERY' && !userSettings[userId].game_type) {
              userSettings[userId].game_type = "WINGO30S";
            }
          }
          
          const balance = await getBalanceWithRetry(session, platform, userId);
          userStats[userId] = { start_balance: parseFloat(balance || 0), profit: 0.0 };
          
          const balanceDisplay = balance !== null ? balance : 0.0;
          await sendMessageWithRetry(chatId, formatLoginSuccess(config, userInfo, balanceDisplay), makeMainKeyboard(true, userId));
        } else {
          await sendMessageWithRetry(chatId, 
            `❌ 𝑳𝒐𝒈𝒊𝒏 𝑭𝒂𝒊𝒍𝒆𝒅\n\n𝑼𝒏𝒂𝒃𝒍𝒆 𝒕𝒐 𝒓𝒆𝒕𝒓𝒊𝒆𝒗𝒆 𝒖𝒔𝒆𝒓 𝒊𝒏𝒇𝒐𝒓𝒎𝒂𝒕𝒊𝒐𝒏.\n\n🔑 𝑷𝒍𝒆𝒂𝒔𝒆 𝒄𝒉𝒆𝒄𝒌 𝒚𝒐𝒖𝒓 𝒄𝒓𝒆𝒅𝒆𝒏𝒕𝒊𝒂𝒍𝒔 𝒂𝒏𝒅 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏`,
            makeLoginKeyboard()
          );
        }
      } else {
        const errorMsg = res.msg || "Login failed";
        await sendMessageWithRetry(chatId, 
          `❌ 𝑳𝒐𝒈𝒊𝒏 𝑬𝒓𝒓𝒐𝒓\n\n${errorMsg}\n\n🔑 𝑷𝒍𝒆𝒂𝒔𝒆 𝒄𝒉𝒆𝒄𝒌 𝒚𝒐𝒖𝒓 𝒄𝒓𝒆𝒅𝒆𝒏𝒕𝒊𝒂𝒍𝒔 𝒂𝒏𝒅 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏`,
          makeLoginKeyboard()
        );
      }
      
      delete userState[userId];
      return;
    }
    
    await sendMessageWithRetry(chatId, 
      `🔐 𝑳𝒐𝒈𝒊𝒏 𝑰𝒏𝒔𝒕𝒓𝒖𝒄𝒕𝒊𝒐𝒏𝒔\n\n📝 𝑭𝒐𝒓𝒎𝒂𝒕:\n𝑳𝒐𝒈𝒊𝒏\n𝒀𝒐𝒖𝒓𝑷𝒉𝒐𝒏𝒆𝑵𝒖𝒎𝒃𝒆𝒓\n𝒀𝒐𝒖𝒓𝑷𝒂𝒔𝒔𝒘𝒐𝒓𝒅\n\n📱 𝑬𝒙𝒂𝒎𝒑𝒍𝒆:\n𝑳𝒐𝒈𝒊𝒏\n09123456789\n𝒑𝒂𝒔𝒔𝒘𝒐𝒓𝒅123\n\n⚠️ 𝑷𝒉𝒐𝒏𝒆 𝒏𝒖𝒎𝒃𝒆𝒓 𝒔𝒉𝒐𝒖𝒍𝒅 𝒏𝒐𝒕 𝒊𝒏𝒄𝒍𝒖𝒅𝒆 𝒄𝒐𝒖𝒏𝒕𝒓𝒚 𝒄𝒐𝒅𝒆 𝒑𝒓𝒆𝒇𝒊𝒙`
    );
    return;
  }
  
  // Check if user is logged in
  const isLoggedIn = checkUserLoggedIn(userId);
  
  if (!isLoggedIn) {
    if (rawText === "🔐 𝑳𝒐𝒈𝒊𝒏") {
      await sendMessageWithRetry(chatId, formatWelcomeMessage(), makePlatformKeyboard());
      return;
    }
    
    await sendMessageWithRetry(chatId, 
      `🔐 𝑳𝒐𝒈𝒊𝒏 𝑹𝒆𝒒𝒖𝒊𝒓𝒆𝒅\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒍𝒐𝒈𝒊𝒏 𝒇𝒊𝒓𝒔𝒕 𝒕𝒐 𝒖𝒔𝒆 𝒕𝒉𝒆 𝒃𝒐𝒕 𝒇𝒆𝒂𝒕𝒖𝒓𝒆𝒔.\n\n👇 𝑺𝒆𝒍𝒆𝒄𝒕 𝒚𝒐𝒖𝒓 𝒑𝒍𝒂𝒕𝒇𝒐𝒓𝒎:`,
      makePlatformKeyboard()
    );
    return;
  }
  
  if (!userSettings[userId]) {
    userSettings[userId] = {
      mode: "REAL",
      strategy: null,
      betting_strategy: "Martingale",
      martin_index: 0,
      dalembert_units: 1,
      pattern_index: 0,
      running: false,
      consecutive_losses: 0,
      current_layer: 0,
      skip_betting: false,
      game_type: "TRX",
    };
  }
  
  try {
    const currentState = userState[userId]?.state;
    const settings = userSettings[userId] || {};
    const platform = settings.platform || '777BIGWIN';
    const config = getPlatformConfig(platform);
    
    // State-based input handling
    if (currentState === "INPUT_BET_SIZES") {
      const betSizes = lines.filter(s => /^\d+$/.test(s)).map(Number);
      
      if (!betSizes.length) {
        throw new Error("No valid numbers provided");
      }
      
      userSettings[userId].bet_sizes = betSizes;
      userSettings[userId].dalembert_units = 1;
      await sendMessageWithRetry(chatId, 
        `💊 𝑩𝒆𝒕_𝑾𝒓𝒂𝒈𝒆𝒓𝒔 𝑼𝒑𝒅𝒂𝒕𝒆𝒅\n\n🧩 𝑺𝒊𝒛𝒆𝒔: ${betSizes.join(', ')} MMK\n\n🎄𝑩𝒆𝒕 𝒔𝒊𝒛𝒆𝒔 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚`,
        makeMainKeyboard(true, userId)
      );
      delete userState[userId];
      
    } else if (currentState === "INPUT_PROFIT_TARGET") {
      const target = parseFloat(lines[0]);
      
      if (isNaN(target) || target <= 0) {
        throw new Error("Invalid profit target amount");
      }
      
      userSettings[userId].target_profit = target;
      await sendMessageWithRetry(chatId, 
        `🧧 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕 𝑼𝒑𝒅𝒂𝒕𝒆𝒅\n\n🧩 𝑻𝒂𝒓𝒈𝒆𝒕: ${target.toFixed(2)} Ks\n\n🎄𝑻𝒂𝒓𝒈𝒆𝒕 𝒑𝒓𝒐𝒇𝒊𝒕 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚`,
        makeRiskControlKeyboard()
      );
      delete userState[userId];
      
    } else if (currentState === "INPUT_STOP_LIMIT") {
      const stopLoss = parseFloat(lines[0]);
      
      if (isNaN(stopLoss) || stopLoss <= 0) {
        throw new Error("Invalid stop loss amount");
      }
      
      userSettings[userId].stop_loss = stopLoss;
      await sendMessageWithRetry(chatId, 
        `🌡️ 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒔 𝑼𝒑𝒅𝒂𝒕𝒆𝒅\n\n📉 𝑳𝒊𝒎𝒊𝒕: ${stopLoss.toFixed(2)} Ks\n\n🎄𝑺𝒕𝒐𝒑 𝒍𝒐𝒔𝒔 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚`,
        makeRiskControlKeyboard()
      );
      delete userState[userId];
      
    } else {
      // 🔥 NEW MENU BUTTON HANDLING
      
      // Bet Size button
      if (rawText.trim() === "💊 𝑩𝒆𝒕_𝑾𝒓𝒂𝒈𝒆𝒓") {
        userState[userId] = { state: "INPUT_BET_SIZES" };
        await sendMessageWithRetry(chatId, 
          `💊 𝑺𝒆𝒕 𝑩𝒆𝒕 𝑾𝒓𝒂𝒈𝒆𝒓\n\n𝑬𝒏𝒕𝒆𝒓 𝒃𝒆𝒕 𝒘𝒓𝒂𝒈𝒆𝒓 𝒊𝒏 MMK (𝒐𝒏𝒆 𝒑𝒆𝒓 𝒍𝒊𝒏𝒆):\n\n100\n200\n500\n\n💡 𝑬𝒙𝒂𝒎𝒑𝒍𝒆: 100 = 100KS`,
          makeMainKeyboard(true, userId)
        );
        
      } 
      // 🎃 Bet Place Settings button
      else if (rawText.trim() === "🎃 𝑩𝒆𝒕 𝑷𝒍𝒂𝒄𝒆 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔") {
        await sendMessageWithRetry(chatId, "🎃 𝑩𝒆𝒕 𝑷𝒍𝒂𝒄𝒆 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔:", makeBetPlaceSettingsKeyboard());
        
      }
      // 📟 Risk Control button
      else if (rawText.trim() === "📟 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍") {
        await sendMessageWithRetry(chatId, "📟 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍 𝑴𝒆𝒏𝒖:", makeRiskControlKeyboard());
        
      }
      // ⏰TIME START button
      else if (rawText.trim() === "⏰𝑻𝑰𝑴𝑬 𝑺𝑻𝑨𝑹𝑻⏰") {
        await sendMessageWithRetry(chatId, "⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔:", makeTimeStartKeyboard());
        
      }
      // 🗃 Info button
      else if (rawText.trim() === "🗃 𝑰𝒏𝒇𝒐") {
        const session = userSessions[userId];
        const userInfo = await getUserInfo(session, platform, userId);
        
        let currentBalance = null;
        if (session) {
          currentBalance = await getBalanceWithRetry(session, platform, userId);
        }
        
        const gameType = settings.game_type || (platform === '6LOTTERY' ? "WINGO30S" : "TRX");
        const infoMessage = formatInfoMessage(config, userInfo, settings, currentBalance, gameType, userId);
        await sendMessageWithRetry(chatId, infoMessage, makeMainKeyboard(true, userId));
        
      }
      // Silent Mode button
      else if (rawText.trim() === "🫆 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆" || rawText.trim() === "🫆 silentMode") {
        userSilentMode[userId] = !userSilentMode[userId];
        
        const modeText = userSilentMode[userId] ? "🔇 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆" : "🫆 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆";
        const statusText = userSilentMode[userId] ? 
          "(𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆)\n\n🎄အနိုင်အရှုံး notification မပေးတော့ပါ\n📊 Profit update တွေကို auto-edit လုပ်ပါမယ်" :
          "(𝑺𝒊𝒍𝒆𝒏𝒕𝑴𝒐𝒅𝒆 𝑶𝒇𝒇)\n\n🎄အနိုင်အရှုံး notification ပေးပါတယ်";
        
        await sendMessageWithRetry(chatId, 
          `${modeText}\n\n${statusText}`,
          makeMainKeyboard(true, userId)
        );
        
      }
      // 🔐 Re-Login button
      else if (rawText.trim() === "🔐 𝑹𝒆-𝑳𝒐𝒈𝒊𝒏") {
        delete userSessions[userId];
        delete userTemp[userId]?.platform;
        delete userSettings[userId]?.platform;
        await sendMessageWithRetry(chatId, 
          `🔐 𝑹𝒆-𝑳𝒐𝒈𝒊𝒏\n\n𝑺𝒆𝒔𝒔𝒊𝒐𝒏 𝒄𝒍𝒆𝒂𝒓𝒆𝒅. 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒍𝒆𝒄𝒕 𝒚𝒐𝒖𝒓 𝒑𝒍𝒂𝒕𝒇𝒐𝒓𝒎 𝒂𝒈𝒂𝒊𝒏.`,
          makePlatformKeyboard()
        );
        
      }
      // 🕹 Anti/Martingale button (from Bet Place Settings)
      else if (rawText.trim() === "🕹 𝑨𝒏𝒕𝒊/𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆") {
        await sendMessageWithRetry(chatId, "♻️ 𝑪𝒉𝒐𝒐𝒔𝒆 𝑩𝒆𝒕𝒕𝒊𝒏𝒈 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚:", makeBettingStrategyKeyboard());
        
      }
      // 🎲 Game Type button (from Bet Place Settings)
      else if (rawText.trim() === "🎲 𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆") {
        await sendMessageWithRetry(chatId, "🎮 𝑪𝒉𝒐𝒐𝒔𝒆 𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆:", makeGameTypeKeyboard());
        
      }
      // 🔙 Back to Auto Bet button
      else if (rawText.trim() === "🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑨𝒖𝒕𝒐 𝑩𝒆𝒕") {
        await sendMessageWithRetry(chatId, "🔙 𝑹𝒆𝒕𝒖𝒓𝒏𝒊𝒏𝒈 𝒕𝒐 𝒎𝒂𝒊𝒏 𝒎𝒆𝒏𝒖...", makeMainKeyboard(true, userId));
        
      }
      // 🧧 Profit Target button (from Risk Control)
      else if (rawText.trim() === "🧧 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕") {
        userState[userId] = { state: "INPUT_PROFIT_TARGET" };
        await sendMessageWithRetry(chatId, 
          `🎯 𝑺𝒆𝒕 𝑷𝒓𝒐𝒇𝒊𝒕 𝑻𝒂𝒓𝒈𝒆𝒕\n\n𝑬𝒏𝒕𝒆𝒓 𝒕𝒂𝒓𝒈𝒆𝒕 𝒑𝒓𝒐𝒇𝒊𝒕 𝒂𝒎𝒐𝒖𝒏𝒕 𝒊𝒏 Ks:\n\n5000\n\n💡 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒔𝒕𝒐𝒑 𝒂𝒖𝒕𝒐𝒎𝒂𝒕𝒊𝒄𝒂𝒍𝒍𝒚 𝒘𝒉𝒆𝒏 𝒕𝒂𝒓𝒈𝒆𝒕 𝒊𝒔 𝒓𝒆𝒂𝒄𝒉𝒆𝒅`,
          makeRiskControlKeyboard()
        );
        
      }
      // 🌡️ Stop Lose Limit button (from Risk Control)
      else if (rawText.trim() === "🌡️ 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒆 𝑳𝒊𝒎𝒊𝒕") {
        userState[userId] = { state: "INPUT_STOP_LIMIT" };
        await sendMessageWithRetry(chatId, 
          `🌡️ 𝑺𝒆𝒕 𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒔 𝑨𝒎𝒐𝒖𝒏𝒕\n\n𝑬𝒏𝒕𝒆𝒓 𝒎𝒂𝒙𝒊𝒎𝒖𝒎 𝒍𝒐𝒔𝒔 𝒂𝒎𝒐𝒖𝒏𝒕 𝒊𝒏 Ks:\n\n𝑬𝒙𝒂𝒎𝒑𝒍𝒆: 5000\n\n🧩 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒔𝒕𝒐𝒑 𝒂𝒖𝒕𝒐𝒎𝒂𝒕𝒊𝒄𝒂𝒍𝒍𝒚 𝒘𝒉𝒆𝒏 𝒕𝒉𝒊𝒔 𝒍𝒐𝒔𝒔 𝒊𝒔 𝒓𝒆𝒂𝒄𝒉𝒆𝒅`,
          makeRiskControlKeyboard()
        );
        
      }
      // ⛳ Entry Layer button (from Risk Control)
      else if (rawText.trim() === "⛳ 𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓") {
        await sendMessageWithRetry(chatId, "🎢 𝑺𝒆𝒍𝒆𝒄𝒕 𝑬𝒏𝒕𝒓𝒚 𝑳𝒂𝒚𝒆𝒓:", makeEntryLayerKeyboard());
        
      }
      // 💥 Bet_SL button (from Risk Control)
      else if (rawText.trim() === "💥 𝑩𝒆𝒕_𝑺𝑳") {
        await sendMessageWithRetry(chatId, "🧬 𝑺𝒆𝒍𝒆𝒄𝒕 𝑺𝑳 (𝑺𝒕𝒐𝒑 𝑳𝒐𝒔𝒔) 𝒍𝒊𝒎𝒊𝒕:", makeNumberPadKeyboard("sl_limit", "𝑺𝑳 𝑳𝒊𝒎𝒊𝒕"));
        
      }
      // 📚 Strategy button (from Risk Control)
      else if (rawText.trim() === "📚 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚") {
        await sendMessageWithRetry(chatId, "📚 𝑪𝒉𝒐𝒐𝒔𝒆 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚:", makeRiskControlStrategyKeyboard());
        
      }
      // 🔙 Back to Risk Control button
      else if (rawText.trim() === "🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍") {
        await sendMessageWithRetry(chatId, "🔙 𝑹𝒆𝒕𝒖𝒓𝒏𝒊𝒏𝒈 𝒕𝒐 𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍...", makeRiskControlKeyboard());
        
      }
      // Strategy selection buttons (from Risk Control Strategy menu)
      else if (rawText.trim() === "🔥 𝑸𝑼𝑨𝑵𝑻𝑼𝑴 𝑩𝑹𝑨𝑰𝑵") {
        userSettings[userId].strategy = "QUANTUM_BRAIN";
        await sendMessageWithRetry(chatId, 
          `🔥 𝑸𝑼𝑨𝑵𝑻𝑼𝑴 𝑩𝑹𝑨𝑰𝑵 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅!\n\n🧠 𝑸𝒖𝒂𝒏𝒕𝒖𝒎 𝒏𝒆𝒖𝒓𝒂𝒍 𝒏𝒆𝒕𝒘𝒐𝒓𝒌 𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆𝒅\n🎯 60%+ 𝒂𝒄𝒄𝒖𝒓𝒂𝒄𝒚 𝒘𝒊𝒕𝒉 𝒔𝒂𝒇𝒆𝒕𝒚 𝒍𝒊𝒎𝒊𝒕𝒔\n🎄𝑺𝒂𝒗𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚!`,
          makeRiskControlKeyboard()
        );
        
      } else if (rawText.trim() === "🌌 𝑯𝒀𝑷𝑬𝑹 𝑫𝑰𝑴𝑬𝑵𝑺𝑰𝑶𝑵𝑨𝑳") {
        userSettings[userId].strategy = "HYPER_DIMENSIONAL";
        await sendMessageWithRetry(chatId, 
          `🌌 𝑯𝒀𝑷𝑬𝑹 𝑫𝑰𝑴𝑬𝑵𝑺𝑰𝑶𝑵𝑨𝑳 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅!\n\n🌀 11𝑫 𝒕𝒆𝒏𝒔𝒐𝒓 𝒄𝒂𝒍𝒄𝒖𝒍𝒖𝒔 𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆𝒅\n⚛️ 𝑸𝒖𝒂𝒏𝒕𝒖𝒎 𝒇𝒊𝒆𝒍𝒅 𝒕𝒉𝒆𝒐𝒓𝒚 𝒊𝒎𝒑𝒍𝒆𝒎𝒆𝒏𝒕𝒆𝒅\n🎄𝑺𝒂𝒗𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚!`,
          makeRiskControlKeyboard()
        );
        
      } else if (rawText.trim() === "🎰 𝑨𝑷𝑰 𝑹𝑼𝑳𝑬") {
        userSettings[userId].strategy = "API_RULE";
        await sendMessageWithRetry(chatId, 
          `🎰 𝑨𝑷𝑰 𝑹𝑼𝑳𝑬 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅!\n\n🔢 𝑬𝒙𝒂𝒄𝒕 𝑨𝑷𝑰 𝒇𝒐𝒓𝒎𝒖𝒍𝒂 𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆𝒅\n📊 32,000 𝒅𝒊𝒈𝒊𝒕 𝒔𝒖𝒎 𝒂𝒏𝒂𝒍𝒚𝒔𝒊𝒔\n🎄𝑺𝒂𝒗𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚!`,
          makeRiskControlKeyboard()
        );
        
      } else if (rawText.trim() === "🤖 𝑹𝑵𝑮 𝑺𝒀𝑺𝑻𝑬𝑴") {
        userSettings[userId].strategy = "RNG_SYSTEM";
        await sendMessageWithRetry(chatId, 
          `🤖 𝑹𝑵𝑮 𝑺𝒀𝑺𝑻𝑬𝑴 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅!\n\n🔍 𝑹𝑵𝑮 𝒓𝒖𝒍𝒆 𝒂𝒖𝒕𝒐-𝒅𝒆𝒕𝒆𝒄𝒕𝒊𝒐𝒏 𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆𝒅\n🎲 𝑹𝒆𝒗𝒆𝒓𝒔𝒆 𝒆𝒏𝒈𝒊𝒏𝒆𝒆𝒓𝒊𝒏𝒈 𝒆𝒏𝒂𝒃𝒍𝒆𝒅\n🎄𝑺𝒂𝒗𝒆𝒅 𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚!`,
          makeRiskControlKeyboard()
        );
        
      }
      // Betting Strategy selection buttons
      else if (rawText.trim() === "📈 𝑨𝒏𝒕𝒊-𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆") {
        userSettings[userId].betting_strategy = "Anti-Martingale";
        await sendMessageWithRetry(chatId, `🎄𝑩𝒆𝒕𝒕𝒊𝒏𝒈 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒔𝒆𝒕 𝒕𝒐: 𝑨𝒏𝒕𝒊-𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "📉 𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆") {
        userSettings[userId].betting_strategy = "Martingale";
        await sendMessageWithRetry(chatId, `🎄𝑩𝒆𝒕𝒕𝒊𝒏𝒈 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒔𝒆𝒕 𝒕𝒐: 𝑴𝒂𝒓𝒕𝒊𝒏𝒈𝒂𝒍𝒆`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "⚖️ 𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕") {
        userSettings[userId].betting_strategy = "D'Alembert";
        await sendMessageWithRetry(chatId, `🎄𝑩𝒆𝒕𝒕𝒊𝒏𝒈 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒔𝒆𝒕 𝒕𝒐: 𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕`, makeBetPlaceSettingsKeyboard());
        
      }
      // Game Type selection buttons
      else if (rawText.trim() === "🎮 𝑻𝑹𝑿") {
        userSettings[userId].game_type = "TRX";
        await sendMessageWithRetry(chatId, `🎄𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆 𝒔𝒆𝒕 𝒕𝒐: 𝑻𝑹𝑿`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "⚡ 𝑾𝑰𝑵𝑮𝑶𝟑𝟎𝑺") {
        userSettings[userId].game_type = "WINGO30S";
        await sendMessageWithRetry(chatId, `🎄𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆 𝒔𝒆𝒕 𝒕𝒐: 𝑾𝑰𝑵𝑮𝑶𝟑𝟎𝑺`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "⏰ 𝑾𝑰𝑵𝑮𝑶𝟏𝑴𝑰𝑵") {
        userSettings[userId].game_type = "WINGO1MIN";
        await sendMessageWithRetry(chatId, `🎄𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆 𝒔𝒆𝒕 𝒕𝒐: 𝑾𝑰𝑵𝑮𝑶𝟏𝑴𝑰𝑵`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "🕒 𝑾𝑰𝑵𝑮𝑶𝟑𝑴𝑰𝑵") {
        userSettings[userId].game_type = "WINGO3MIN";
        await sendMessageWithRetry(chatId, `🎄𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆 𝒔𝒆𝒕 𝒕𝒐: 𝑾𝑰𝑵𝑮𝑶𝟑𝑴𝑰𝑵`, makeBetPlaceSettingsKeyboard());
        
      } else if (rawText.trim() === "⌛ 𝑾𝑰𝑵𝑮𝑶𝟓𝑴𝑰𝑵") {
        userSettings[userId].game_type = "WINGO5MIN";
        await sendMessageWithRetry(chatId, `🎄𝑮𝒂𝒎𝒆 𝑻𝒚𝒑𝒆 𝒔𝒆𝒕 𝒕𝒐: 𝑾𝑰𝑵𝑮𝑶𝟓𝑴𝑰𝑵`, makeBetPlaceSettingsKeyboard());
        
      }
      // 🔙 Back to Bet Settings button
      else if (rawText.trim() === "🔙 𝑩𝒂𝒄𝒌 𝒕𝒐 𝑩𝒆𝒕 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔") {
        await sendMessageWithRetry(chatId, "🔙 𝑹𝒆𝒕𝒖𝒓𝒏𝒊𝒏𝒈 𝒕𝒐 𝑩𝒆𝒕 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔...", makeBetPlaceSettingsKeyboard());
        
      }
      // 🔋 Activate button
      else if (rawText.trim() === "🔋 𝑨𝒄𝒕𝒊𝒗𝒂𝒕𝒆") {
        log('INFO', `🔋 Activate command for user ${userId}, settings: ${JSON.stringify(settings)}`);
        
        if (!settings.bet_sizes || settings.bet_sizes.length === 0) {
          await sendMessageWithRetry(chatId,
            `🧨 𝑬𝑹𝑹𝑶𝑹: 𝑩𝒆𝒕 𝑾𝒓𝒂𝒈𝒆𝒓 𝒏𝒐𝒕 𝑪𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅!\n\n` +
            `🎋 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝒚𝒐𝒖𝒓 𝒃𝒆𝒕 𝒘𝒓𝒂𝒈𝒆𝒓 𝒇𝒊𝒓𝒔𝒕!\n\n` +
            `⚙️ 𝑮𝒐 𝒕𝒐 "𝑩𝒆𝒕_𝑾𝒓𝒂𝒈𝒆𝒓" 𝒃𝒖𝒕𝒕𝒐𝒏\n` +
            `📝 𝑬𝒏𝒕𝒆𝒓 𝒂𝒎𝒐𝒖𝒏𝒕𝒔 (𝒐𝒏𝒆 𝒑𝒆𝒓 𝒍𝒊𝒏𝒆):\n` +
            `100\n300\n700\n1500\n\n` +
            `🚫 𝑩𝒐𝒕 𝒄𝒂𝒏𝒏𝒐𝒕 𝒔𝒕𝒂𝒓𝒕 𝒘𝒊𝒕𝒉𝒐𝒖𝒕 𝒃𝒆𝒕 𝒘𝒓𝒂𝒈𝒆𝒓!`,
            makeMainKeyboard(true, userId)
          );
          return;
        }
        
        if (!settings.strategy) {
          await sendMessageWithRetry(chatId,
            `🧨 𝑬𝑹𝑹𝑶𝑹: 𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝑵𝒐𝒕 𝑺𝒆𝒍𝒆𝒄𝒕𝒆𝒅!\n\n` +
            `📚 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒍𝒆𝒄𝒕 𝒂 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒚 𝒇𝒊𝒓𝒔𝒕!\n\n` +
            `⚙️ 𝑮𝒐 𝒕𝒐 "𝑹𝒊𝒔𝒌 𝑪𝒐𝒏𝒕𝒓𝒐𝒍" → "𝑺𝒕𝒓𝒂𝒕𝒆𝒈𝒚" 𝒃𝒖𝒕𝒕𝒐𝒏\n` +
            `🎯 𝑪𝒉𝒐𝒐𝒔𝒆 𝒇𝒓𝒐𝒎 𝒂𝒗𝒂𝒊𝒍𝒂𝒃𝒍𝒆 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒊𝒆𝒔\n\n` +
            `🚫 𝑩𝒐𝒕 𝒄𝒂𝒏𝒏𝒐𝒕 𝒔𝒕𝒂𝒓𝒕 𝒘𝒊𝒕𝒉𝒐𝒖𝒕 𝒂 𝒔𝒕𝒓𝒂𝒕𝒆𝒈𝒚!`,
            makeMainKeyboard(true, userId)
          );
          return;
        }
        
        if (settings.betting_strategy === "D'Alembert" && settings.bet_sizes.length > 1) {
          await sendMessageWithRetry(chatId, 
            `⚠️ 𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕 𝑪𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒂𝒕𝒊𝒐𝒏\n\n𝑫'𝑨𝒍𝒆𝒎𝒃𝒆𝒓𝒕 𝒓𝒆𝒒𝒖𝒊𝒓𝒆𝒔 𝒂 𝒔𝒊𝒏𝒈𝒍𝒆 𝑩𝑬𝑻 𝑺𝑰𝒁𝑬.\n\n⚙️ 𝑷𝒍𝒆𝒂𝒔𝒆 𝒔𝒆𝒕 𝒐𝒏𝒍𝒚 𝒐𝒏𝒆 𝒃𝒆𝒕 𝒔𝒊𝒛𝒆`,
            makeMainKeyboard(true, userId)
          );
          return;
        }
        
        if (settings.running) {
          await sendMessageWithRetry(chatId, 
            `⚠️ 𝑩𝒐𝒕 𝑨𝒍𝒓𝒆𝒂𝒅𝒚 𝑹𝒖𝒏𝒏𝒊𝒏𝒈\n\n𝑻𝒉𝒆 𝒃𝒐𝒕 𝒊𝒔 𝒂𝒍𝒓𝒆𝒂𝒅𝒚 𝒂𝒄𝒕𝒊𝒗𝒆.\n\n⏹️ 𝑺𝒕𝒐𝒑 𝒕𝒉𝒆 𝒃𝒐𝒕 𝒇𝒊𝒓𝒔𝒕 𝒕𝒐 𝒄𝒉𝒂𝒏𝒈𝒆 𝒔𝒆𝒕𝒕𝒊𝒏𝒈𝒔`,
            makeMainKeyboard(true, userId)
          );
          return;
        }
        
        // Reset betting parameters
        settings.martin_index = 0;
        settings.dalembert_units = 1;
        settings.pattern_index = 0;
        settings.consecutive_losses = 0;
        settings.current_layer = 0;
        settings.skip_betting = false;
        settings.running = true;
        settings.consecutive_errors = 0;
        userWaitingForResult[userId] = false;
        
        // Check if within time start
        if (!isWithinTimeStart(userId)) {
          const timeStarts = getTimeStartDisplay(userId);
          await sendMessageWithRetry(chatId, 
            `⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕 𝑹𝒆𝒔𝒕𝒓𝒊𝒄𝒕𝒊𝒐𝒏\n\n𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒐𝒏𝒍𝒚 𝒓𝒖𝒏 𝒅𝒖𝒓𝒊𝒏𝒈 𝒚𝒐𝒖𝒓 𝒄𝒐𝒏𝒇𝒊𝒈𝒖𝒓𝒆𝒅 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕𝒔:\n\n${timeStarts}\n\n𝑪𝒖𝒓𝒓𝒆𝒏𝒕𝒍𝒚 𝒐𝒖𝒕𝒔𝒊𝒅𝒆 𝒐𝒇 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕 𝒘𝒊𝒏𝒅𝒐𝒘𝒔. 𝑩𝒐𝒕 𝒘𝒊𝒍𝒍 𝒘𝒂𝒊𝒕 𝒖𝒏𝒕𝒊𝒍 𝒘𝒊𝒕𝒉𝒊𝒏 𝒕𝒊𝒎𝒆 𝒔𝒕𝒂𝒓𝒕.`,
            makeMainKeyboard(true, userId)
          );
        }
        
        // Start betting worker
        settings.task = bettingWorker(userId, chatId);
        
      } else if (rawText.trim() === "🪫 𝑫𝒆𝒂𝒄𝒕𝒊𝒗𝒂𝒕𝒆") {
        const settings = userSettings[userId] || {};
        
        if (!settings.running) {
          await sendMessageWithRetry(chatId, 
            `⚠️ 𝑩𝒐𝒕 𝑵𝒐𝒕 𝑹𝒖𝒏𝒏𝒊𝒏𝒈\n\n𝑻𝒉𝒆 𝒃𝒐𝒕 𝒊𝒔 𝒄𝒖𝒓𝒓𝒆𝒏𝒕𝒍𝒚 𝒔𝒕𝒐𝒑𝒑𝒆𝒅.\n\n🚀 𝑼𝒔𝒆 𝑺𝒕𝒂𝒓𝒕 𝒕𝒐 𝒃𝒆𝒈𝒊𝒏`,
            makeMainKeyboard(true, userId)
          );
          return;
        }
        
        settings.running = false;
        
        if (settings.task) {
          if (typeof settings.task === 'object' && typeof settings.task.cancel === 'function') {
            settings.task.cancel();
          }
          settings.task = null;
        }
        
        delete userWaitingForResult[userId];
        
        // Delete profit message if exists
        if (userProfitMessageId[userId]) {
          try {
            await bot.deleteMessage(userId, userProfitMessageId[userId]);
          } catch (error) {
            log('INFO', `⚠️ Could not delete profit message: ${error.message}`);
          }
          delete userProfitMessageId[userId];
        }
        
        await sendMessageWithRetry(chatId, 
          `⏹️ 𝑺𝒕𝒐𝒑𝒑𝒊𝒏𝒈 𝑩𝒐𝒕\n\n𝑩𝒐𝒕 𝒔𝒉𝒖𝒕𝒅𝒐𝒘𝒏 𝒊𝒏 𝒑𝒓𝒐𝒈𝒓𝒆𝒔𝒔...\n\n⏳ 𝑷𝒍𝒆𝒂𝒔𝒆 𝒘𝒂𝒊𝒕 𝒇𝒐𝒓 𝒄𝒐𝒏𝒇𝒊𝒓𝒎𝒂𝒕𝒊𝒐𝒏`
        );
        
      } else {
        await sendMessageWithRetry(chatId, 
          `🤔 𝑪𝒐𝒎𝒎𝒂𝒏𝒅 𝑵𝒐𝒕 𝑹𝒆𝒄𝒐𝒈𝒏𝒊𝒛𝒆𝒅\n\n𝑷𝒍𝒆𝒂𝒔𝒆 𝒖𝒔𝒆 𝒕𝒉𝒆 𝒎𝒆𝒏𝒖 𝒃𝒖𝒕𝒕𝒐𝒏𝒔 𝒃𝒆𝒍𝒐𝒘:\n\n👇 𝑺𝒆𝒍𝒆𝒄𝒕 𝒂𝒏 𝒐𝒑𝒕𝒊𝒐𝒏 𝒇𝒓𝒐𝒎 𝒕𝒉𝒆 𝒎𝒆𝒏𝒖:`,
          makeMainKeyboard(true, userId)
        );
      }
    }
  } catch (error) {
    log('ERROR', `🧨 ERROR handling input for user ${userId}: ${error.message}`);
    await sendMessageWithRetry(chatId, 
      `🧨 𝑬𝑹𝑹𝑶𝑹\n\n${error.message}\n\n🔄 𝑷𝒍𝒆𝒂𝒔𝒆 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏 𝒐𝒓 𝒄𝒐𝒏𝒕𝒂𝒄𝒕 𝒔𝒖𝒑𝒑𝒐𝒓𝒕`,
      makeMainKeyboard(true, userId)
    );
  }
});

// ============================================
// BOT INITIALIZATION
// ============================================

const init = async () => {
  try {
    try {
      await fs.access(SYSTEM_MODE_FILE);
    } catch {
      await saveSystemMode('FREE');
    }
    
    try {
      await fs.access(BANNED_USERS_FILE);
    } catch {
      await saveBannedUsers();
    }
    
    try {
      await fs.access(TIME_START_FILE);
    } catch {
      await saveTimeStartSettings();
    }
    
    try {
      await fs.access(CHANNEL_CONFIG_FILE);
    } catch {
      await saveChannelConfig();
    }
    
    await loadSystemMode();
    await loadBannedUsers();
    await loadTimeStartSettings();
    await loadChannelConfig();
    await loadAllowedUsers('777BIGWIN');
    await loadAllowedUsers('CKLOTTERY');
    await loadAllowedUsers('6LOTTERY');
    
    global.winLoseTask = winLoseChecker();
    
    log('INFO', '🤖 𝑴𝒖𝒍𝒕𝒊-𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎 𝑩𝒐𝒕 𝑰𝒏𝒊𝒕𝒊𝒂𝒍𝒊𝒛𝒆𝒅 (𝑼𝑷𝑫𝑨𝑻𝑬𝑫 𝑺𝑻𝑹𝑨𝑻𝑬𝑮𝒀)');
    log('INFO', `📊 𝑺𝒚𝒔𝒕𝒆𝒎 𝑴𝒐𝒅𝒆: ${SYSTEM_MODE}`);
    log('INFO', `📢 𝑹𝒆𝒒𝒖𝒊𝒓𝒆𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`);
    log('INFO', '🎮 𝑺𝒖𝒑𝒑𝒐𝒓𝒕𝒆𝒅 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔: 𝟕𝟕𝟕 𝑩𝑰𝑮𝑾𝑰𝑵, 𝑪𝑲 𝑳𝑶𝑻𝑻𝑬𝑹𝒀, 𝟔 𝑳𝑶𝑻𝑻𝑬𝑹𝒀');
    log('INFO', '⚡ 𝑭𝒂𝒔𝒕 𝑴𝒐𝒅𝒆: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '🛡️ 𝑼𝒔𝒆𝒓 𝑴𝒂𝒏𝒂𝒈𝒆𝒎𝒆𝒏𝒕 𝑺𝒚𝒔𝒕𝒆𝒎: 𝑨𝑪𝑻𝑰𝑽𝑬');
    log('INFO', '⏰ 𝑻𝒊𝒎𝒆 𝑺𝒕𝒂𝒓𝒕 𝑺𝒚𝒔𝒕𝒆𝒎: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '🔇 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '📊 𝑨𝒖𝒕𝒐-𝑬𝒅𝒊𝒕 𝑷𝒓𝒐𝒇𝒊𝒕: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '📢 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑽𝒆𝒓𝒊𝒇𝒊𝒄𝒂𝒕𝒊𝒐𝒏: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '🔄 𝑺𝒆𝒔𝒔𝒊𝒐𝒏 𝑨𝒖𝒕𝒐-𝑹𝒆𝒇𝒓𝒆𝒔𝒉: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    log('INFO', '🎄𝑩𝒐𝒕 𝒊𝒔 𝒓𝒆𝒂𝒅𝒚 𝒂𝒏𝒅 𝒍𝒊𝒔𝒕𝒆𝒏𝒊𝒏𝒈 𝒇𝒐𝒓 𝒄𝒐𝒎𝒎𝒂𝒏𝒅𝒔');
    
    console.log('\n' + '='.repeat(60));
    console.log('🤖 𝑴𝑼𝑳𝑻𝑰-𝑷𝑳𝑨𝑻𝑭𝑶𝑹𝑴 𝑨𝑼𝑻𝑶 𝑩𝑬𝑻 𝑩𝑶𝑻 (𝑼𝑷𝑫𝑨𝑻𝑬𝑫 𝑽𝑬𝑹𝑺𝑰𝑶𝑵)');
    console.log('='.repeat(60));
    console.log(`📊 𝑺𝒚𝒔𝒕𝒆𝒎 𝑴𝒐𝒅𝒆: ${SYSTEM_MODE}`);
    console.log(`📢 𝑹𝒆𝒒𝒖𝒊𝒓𝒆𝒅 𝑪𝒉𝒂𝒏𝒏𝒆𝒍𝒔: ${requiredChannels.length}`);
    console.log('🎮 𝑷𝒍𝒂𝒕𝒇𝒐𝒓𝒎𝒔: 𝟕𝟕𝟕 𝑩𝑰𝑮𝑾𝑰𝑵, 𝑪𝑲 𝑳𝑶𝑻𝑻𝑬𝑹𝒀, 𝟔 𝑳𝑶𝑻𝑻𝑬𝑹𝒀');
    console.log('⚡ 𝑭𝒂𝒔𝒕 𝑴𝒐𝒅𝒆: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    console.log('🔇 𝑺𝒊𝒍𝒆𝒏𝒕 𝑴𝒐𝒅𝒆: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    console.log('📊 𝑨𝒖𝒕𝒐-𝑬𝒅𝒊𝒕 𝑷𝒓𝒐𝒇𝒊𝒕: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    console.log('📢 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 𝑽𝒆𝒓𝒊𝒇𝒊𝒄𝒂𝒕𝒊𝒐𝒏: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    console.log('🔄 𝑺𝒆𝒔𝒔𝒊𝒐𝒏 𝑨𝒖𝒕𝒐-𝑹𝒆𝒇𝒓𝒆𝒔𝒉: 𝑬𝑵𝑨𝑩𝑳𝑬𝑫');
    console.log(`💰 𝑩𝒂𝒍𝒂𝒏𝒄𝒆 𝑹𝒆𝒕𝒓𝒊𝒆𝒔: ${MAX_BALANCE_RETRIES}`);
    console.log(`⏱️ 𝑩𝒂𝒍𝒂𝒏𝒄𝒆 𝑻𝒊𝒎𝒆𝒐𝒖𝒕: ${BALANCE_API_TIMEOUT}ms`);
    console.log('👑 𝑨𝒅𝒎𝒊𝒏 𝑰𝑫:', ADMIN_ID);
    console.log('📞 𝑨𝒅𝒎𝒊𝒏: @kiki20251');
    console.log('🚀 𝑺𝒕𝒂𝒕𝒖𝒔: စတင်လုပ်ဆောင်နေပါသည်');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    log('ERROR', `❌ Failed to initialize bot: ${error.message}`);
    console.error('❌ Bot initialization failed:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', () => {
  log('INFO', '⏹️ Bot shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('INFO', '⏹️ Bot terminating...');
  process.exit(0);
});

// Start the bot
init().catch(error => {
  log('ERROR', `❌ Failed to start bot: ${error.message}`);
  console.error('❌ Bot startup failed:', error);
  process.exit(1);
});