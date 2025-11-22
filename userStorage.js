// Simple file-based storage for user data
// In production, replace this with a proper database (PostgreSQL, MongoDB, etc.)
const fs = require('fs').promises;
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'users.json');

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
  await initStorage();
  const data = await fs.readFile(STORAGE_FILE, 'utf8');
  return JSON.parse(data);
}

// Get user by WhatsApp phone number
async function getUserByPhone(phoneNumber) {
  const users = await getUsers();
  return users[phoneNumber] || null;
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

