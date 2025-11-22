// Simple file-based storage using JSON file
// Stores user data in a JSON file in the tmp directory
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Storage file path - use tmp directory
const STORAGE_FILE = path.join(os.tmpdir(), 'tary-users.json');

// In-memory cache for faster access
let usersCache = null;
let cacheInitialized = false;

// Initialize storage - load existing data or create empty structure
async function initStorage() {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf8');
    usersCache = JSON.parse(data);
    cacheInitialized = true;
    console.log(`[INFO] Loaded ${Object.keys(usersCache).length} users from storage`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create empty storage
      usersCache = {};
      await saveToFile();
      cacheInitialized = true;
      console.log('[INFO] Created new storage file');
    } else {
      console.error('[ERROR] Failed to initialize storage:', error);
      // Start with empty cache if read fails
      usersCache = {};
      cacheInitialized = true;
    }
  }
}

// Save data to file
async function saveToFile() {
  try {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(usersCache, null, 2), 'utf8');
  } catch (error) {
    console.error('[ERROR] Failed to save to file:', error);
    throw error;
  }
}

// Ensure storage is initialized
async function ensureInitialized() {
  if (!cacheInitialized) {
    await initStorage();
  }
}

// Initialize on module load
initStorage().catch(err => {
  console.error('[ERROR] Failed to initialize storage:', err);
});

// Get user by WhatsApp phone number
async function getUserByPhone(phoneNumber) {
  try {
    await ensureInitialized();
    console.log(`[DEBUG] getUserByPhone called for ${phoneNumber}`);
    
    const user = usersCache[phoneNumber] || null;
    
    if (!user) {
      console.log(`[DEBUG] No user found for ${phoneNumber}`);
      return null;
    }
    
    console.log(`[DEBUG] User found for ${phoneNumber}:`, {
      phoneNumber: user.phoneNumber,
      hasTokens: !!user.googleCalendarTokens,
      hasPendingOAuth: !!user.pendingOAuth,
      calendarLinked: user.calendarLinked
    });
    
    return user;
  } catch (error) {
    console.error(`[DEBUG] Error in getUserByPhone for ${phoneNumber}:`, error);
    throw error;
  }
}

// Save or update user
async function saveUser(phoneNumber, userData) {
  try {
    await ensureInitialized();
    
    const now = new Date().toISOString();
    const existingUser = usersCache[phoneNumber] || {};
    
    // Merge with existing data
    usersCache[phoneNumber] = {
      phoneNumber: phoneNumber,
      googleCalendarTokens: userData.googleCalendarTokens !== undefined 
        ? userData.googleCalendarTokens 
        : existingUser.googleCalendarTokens,
      calendarLinked: userData.calendarLinked !== undefined 
        ? userData.calendarLinked 
        : existingUser.calendarLinked || false,
      calendarLinkedAt: userData.calendarLinkedAt || existingUser.calendarLinkedAt,
      pendingOAuth: userData.pendingOAuth !== undefined 
        ? userData.pendingOAuth 
        : existingUser.pendingOAuth,
      updatedAt: now,
      createdAt: existingUser.createdAt || now
    };
    
    await saveToFile();
    console.log(`[DEBUG] Saved user ${phoneNumber}`);
    
    return usersCache[phoneNumber];
  } catch (error) {
    console.error(`[DEBUG] Error saving user ${phoneNumber}:`, error);
    throw error;
  }
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
  const user = await getUserByPhone(phoneNumber);
  return user?.pendingOAuth || null;
}

// Set pending OAuth state
async function setPendingOAuth(phoneNumber, state) {
  return await saveUser(phoneNumber, {
    pendingOAuth: state
  });
}

// Clear pending OAuth state
async function clearPendingOAuth(phoneNumber) {
  try {
    await ensureInitialized();
    
    if (usersCache[phoneNumber]) {
      usersCache[phoneNumber].pendingOAuth = null;
      usersCache[phoneNumber].updatedAt = new Date().toISOString();
      await saveToFile();
    }
  } catch (error) {
    console.error(`[DEBUG] Error clearing pending OAuth for ${phoneNumber}:`, error);
    throw error;
  }
}

// Get all users (for admin dashboard)
async function getAllUsers() {
  try {
    await ensureInitialized();
    
    return Object.values(usersCache).map(user => ({
      phoneNumber: user.phoneNumber,
      calendarLinked: user.calendarLinked || false,
      calendarLinkedAt: user.calendarLinkedAt || null,
      updatedAt: user.updatedAt || null,
      createdAt: user.createdAt || null
    })).sort((a, b) => {
      // Sort by updatedAt descending
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error('[DEBUG] Error getting all users:', error);
    throw error;
  }
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
