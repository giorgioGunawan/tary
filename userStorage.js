// Database storage using Vercel Postgres or Neon
// Works with both @vercel/postgres (Vercel Postgres) and Neon
// Supports POSTGRES_URL or DATABASE_URL environment variables
const { sql } = require('@vercel/postgres');

// Log connection status on startup (for debugging)
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.warn('[WARNING] No POSTGRES_URL or DATABASE_URL found. Database operations will fail.');
  console.warn('[WARNING] Please add POSTGRES_URL environment variable in Vercel settings.');
} else {
  console.log('[INFO] Database connection string found:', 
    (process.env.POSTGRES_URL || process.env.DATABASE_URL) ? 'Yes' : 'No'
  );
}

// Initialize database table (idempotent - safe to call multiple times)
async function initDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        phone_number VARCHAR(20) PRIMARY KEY,
        google_calendar_tokens JSONB,
        calendar_linked BOOLEAN DEFAULT FALSE,
        calendar_linked_at TIMESTAMP,
        pending_oauth VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('[DEBUG] Database table initialized');
  } catch (error) {
    console.error('[DEBUG] Error initializing database:', error);
    // Don't throw - might already exist
  }
}

// Initialize on module load
initDatabase();

// Get user by WhatsApp phone number
async function getUserByPhone(phoneNumber) {
  try {
    console.log(`[DEBUG] getUserByPhone called for ${phoneNumber}`);
    const result = await sql`
      SELECT * FROM users WHERE phone_number = ${phoneNumber}
    `;
    
    if (result.rows.length === 0) {
      console.log(`[DEBUG] No user found for ${phoneNumber}`);
      return null;
    }
    
    const user = result.rows[0];
    // Parse JSONB tokens if they exist
    if (user.google_calendar_tokens) {
      user.googleCalendarTokens = user.google_calendar_tokens;
    }
    // Map snake_case to camelCase for compatibility
    if (user.pending_oauth) {
      user.pendingOAuth = user.pending_oauth;
    }
    
    console.log(`[DEBUG] User found for ${phoneNumber}:`, {
      found: true,
      hasTokens: !!user.google_calendar_tokens,
      hasPendingOAuth: !!user.pending_oauth
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
    const now = new Date().toISOString();
    
    // Prepare tokens for JSONB storage
    const tokensJson = userData.googleCalendarTokens 
      ? JSON.stringify(userData.googleCalendarTokens)
      : null;
    
    await sql`
      INSERT INTO users (
        phone_number,
        google_calendar_tokens,
        calendar_linked,
        calendar_linked_at,
        pending_oauth,
        updated_at,
        created_at
      )
      VALUES (
        ${phoneNumber},
        ${tokensJson}::jsonb,
        ${userData.calendarLinked || false},
        ${userData.calendarLinkedAt || null},
        ${userData.pendingOAuth || null},
        ${now},
        ${now}
      )
      ON CONFLICT (phone_number)
      DO UPDATE SET
        google_calendar_tokens = COALESCE(${tokensJson}::jsonb, users.google_calendar_tokens),
        calendar_linked = COALESCE(${userData.calendarLinked}, users.calendar_linked),
        calendar_linked_at = COALESCE(${userData.calendarLinkedAt}, users.calendar_linked_at),
        pending_oauth = COALESCE(${userData.pendingOAuth}, users.pending_oauth),
        updated_at = ${now}
    `;
    
    // Return updated user
    return await getUserByPhone(phoneNumber);
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
  return user?.pending_oauth || null;
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
    await sql`
      UPDATE users 
      SET pending_oauth = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE phone_number = ${phoneNumber}
    `;
  } catch (error) {
    console.error(`[DEBUG] Error clearing pending OAuth for ${phoneNumber}:`, error);
    throw error;
  }
}

// Get all users (for admin dashboard)
async function getAllUsers() {
  try {
    const result = await sql`
      SELECT 
        phone_number,
        calendar_linked,
        calendar_linked_at,
        updated_at,
        created_at
      FROM users
      ORDER BY updated_at DESC
    `;
    
    return result.rows.map(row => ({
      phoneNumber: row.phone_number,
      calendarLinked: row.calendar_linked || false,
      calendarLinkedAt: row.calendar_linked_at ? row.calendar_linked_at.toISOString() : null,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
      createdAt: row.created_at ? row.created_at.toISOString() : null
    }));
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
