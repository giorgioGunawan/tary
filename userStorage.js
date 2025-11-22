// Simple file-based storage for user data
// In production, replace this with a proper database (PostgreSQL, MongoDB, etc.)
// Note: Using /tmp for Vercel compatibility (writable filesystem)
// WARNING: /tmp is ephemeral in serverless - data may not persist between invocations
// For production, use a proper database like Vercel Postgres, MongoDB, etc.
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Use /tmp in production (Vercel), local directory in development
const STORAGE_DIR = process.env.VERCEL ? '/tmp' : __dirname;
const STORAGE_FILE = path.join(STORAGE_DIR, 'users.json');

// Initialize storage file if it doesn't exist
async function initStorage() {
  try {
    await fs.access(STORAGE_FILE);
  } catch {
    await fs.writeFile(STORAGE_FILE, JSON.stringify({}, null, 2));
  }
}

// Get all users
async function getUsers() {
  try {
    console.log(`[DEBUG] getUsers called, initializing storage...`);
    await initStorage();
    console.log(`[DEBUG] Storage initialized, reading file: ${STORAGE_FILE}`);
    const data = await fs.readFile(STORAGE_FILE, 'utf8');
    console.log(`[DEBUG] File read successful, length: ${data ? data.length : 0}`);
    // Handle empty file
    if (!data || data.trim() === '') {
      console.log(`[DEBUG] File is empty, returning empty object`);
      return {};
    }
    const parsed = JSON.parse(data);
    console.log(`[DEBUG] JSON parsed successfully, keys: ${Object.keys(parsed).length}`);
    return parsed;
  } catch (error) {
    console.error(`[DEBUG] Error in getUsers:`, {
      code: error.code,
      message: error.message,
      name: error.name
    });
    // If file doesn't exist, return empty object
    if (error.code === 'ENOENT') {
      console.log(`[DEBUG] File doesn't exist, returning empty object`);
      return {};
    }
    // If JSON parse error, return empty object
    if (error instanceof SyntaxError) {
      console.warn('Corrupted users.json file, resetting:', error.message);
      return {};
    }
    throw error;
  }
}

// Get user by WhatsApp phone number
async function getUserByPhone(phoneNumber) {
  try {
    console.log(`[DEBUG] getUserByPhone called for ${phoneNumber}`);
    const users = await getUsers();
    console.log(`[DEBUG] getUsers returned, checking for phone ${phoneNumber}`);
    const user = users[phoneNumber] || null;
    console.log(`[DEBUG] getUserByPhone result:`, {
      found: !!user,
      phoneNumber
    });
    return user;
  } catch (error) {
    console.error(`[DEBUG] Error in getUserByPhone for ${phoneNumber}:`, error);
    throw error;
  }
}

// Save or update user
async function saveUser(phoneNumber, userData) {
  const users = await getUsers();
  users[phoneNumber] = {
    ...users[phoneNumber],
    ...userData,
    phoneNumber,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(STORAGE_FILE, JSON.stringify(users, null, 2));
  return users[phoneNumber];
}

// Store Google Calendar tokens for a user
async function saveCalendarTokens(phoneNumber, tokens) {
  return await saveUser(phoneNumber, {
    googleCalendarTokens: tokens,
    calendarLinked: true,
    calendarLinkedAt: new Date().toISOString()
  });
}

// Get pending OAuth state (for linking flow)
async function getPendingOAuth(phoneNumber) {
  const users = await getUsers();
  return users[phoneNumber]?.pendingOAuth || null;
}

// Set pending OAuth state
async function setPendingOAuth(phoneNumber, state) {
  return await saveUser(phoneNumber, {
    pendingOAuth: state
  });
}

// Clear pending OAuth state
async function clearPendingOAuth(phoneNumber) {
  const users = await getUsers();
  if (users[phoneNumber]) {
    delete users[phoneNumber].pendingOAuth;
    await fs.writeFile(STORAGE_FILE, JSON.stringify(users, null, 2));
  }
}

// Get all users (for admin dashboard)
async function getAllUsers() {
  const users = await getUsers();
  // Return as array with phone numbers
  return Object.keys(users).map(phone => ({
    phoneNumber: phone,
    ...users[phone]
  }));
}

module.exports = {
  getUserByPhone,
  saveUser,
  saveCalendarTokens,
  getPendingOAuth,
  setPendingOAuth,
  clearPendingOAuth,
  getAllUsers
};

