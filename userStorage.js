// Database storage using Vercel Postgres or Neon
// Works with both @vercel/postgres (Vercel Postgres) and Neon
// Supports POSTGRES_URL or DATABASE_URL environment variables
const { sql } = require('@vercel/postgres');

// Log connection status on startup (for debugging)
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.warn('[WARNING] No POSTGRES_URL or DATABASE_URL found. Database operations will fail.');
  console.warn('[WARNING] Please add POSTGRES_URL environment variable in Vercel settings.');
} else {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  console.log('[INFO] Database connection string found: Yes');
  // Log first few chars for debugging (don't log full URL for security)
  if (dbUrl) {
    console.log('[INFO] Database URL format:', dbUrl.substring(0, 20) + '...');
  }
}

// Helper function to execute SQL with timeout and better error handling
async function executeQuery(queryFn, timeoutMs = 10000) {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database connection string not found. Please set POSTGRES_URL or DATABASE_URL environment variable.');
  }
  
  // Create the query promise
  let queryPromise;
  try {
    queryPromise = queryFn();
    
    // Verify it's a promise
    if (!queryPromise || typeof queryPromise.then !== 'function') {
      throw new Error('Query function did not return a promise');
    }
  } catch (error) {
    throw new Error(`Failed to create database query: ${error.message}`);
  }
  
  // Add timeout
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Database query timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  
  try {
    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (error) {
    // Enhance error message with connection info
    if (error.message.includes('timeout')) {
      throw new Error(`Database query timed out. Check if database is accessible and connection string is correct. Original error: ${error.message}`);
    }
    throw error;
  }
}

// Initialize database table (idempotent - safe to call multiple times)
async function initDatabase() {
  try {
    console.log('[DEBUG] Initializing database table...');
    await executeQuery(() => 
      sql`
        CREATE TABLE IF NOT EXISTS users (
          phone_number VARCHAR(20) PRIMARY KEY,
          google_calendar_tokens JSONB,
          calendar_linked BOOLEAN DEFAULT FALSE,
          calendar_linked_at TIMESTAMP,
          pending_oauth VARCHAR(255),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      10000 // 10 second timeout for initialization
    );
    console.log('[DEBUG] Database table initialized successfully');
  } catch (error) {
    console.error('[DEBUG] Error initializing database:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    // Don't throw - might already exist or connection issue
  }
}

// Test database connection
async function testConnection() {
  try {
    console.log('[DEBUG] Testing database connection...');
    await executeQuery(() => sql`SELECT 1 as test`, 5000);
    console.log('[DEBUG] Database connection test successful');
    return true;
  } catch (error) {
    console.error('[DEBUG] Database connection test failed:', {
      message: error.message,
      code: error.code
    });
    return false;
  }
}

// Initialize on module load (don't await - let it run in background)
initDatabase().catch(err => {
  console.error('[DEBUG] Failed to initialize database:', err);
});

// Test connection on startup
testConnection().catch(err => {
  console.error('[DEBUG] Connection test error:', err);
});

// Get user by WhatsApp phone number
async function getUserByPhone(phoneNumber) {
  try {
    console.log(`[DEBUG] getUserByPhone called for ${phoneNumber}`);
    console.log(`[DEBUG] Executing SQL query...`);
    
    const result = await executeQuery(() => 
      sql`SELECT * FROM users WHERE phone_number = ${phoneNumber}`
    );
    
    console.log(`[DEBUG] Query completed, rows: ${result.rows ? result.rows.length : 0}`);
    
    if (result.rows.length === 0) {
      console.log(`[DEBUG] No user found for ${phoneNumber}`);
      return null;
    }
    
    console.log(`[DEBUG] User found, processing data...`);
    const user = result.rows[0];
    
    // Safely log user data (avoid logging JSONB directly as it can cause issues)
    console.log(`[DEBUG] User found for ${phoneNumber}:`, {
      phoneNumber: user.phone_number,
      hasTokens: !!user.google_calendar_tokens,
      hasPendingOAuth: !!user.pending_oauth,
      calendarLinked: user.calendar_linked,
      tokenType: user.google_calendar_tokens ? typeof user.google_calendar_tokens : null
    });
    
    // Parse JSONB tokens if they exist
    // JSONB fields come as objects from PostgreSQL, but we need to ensure they're properly handled
    if (user.google_calendar_tokens) {
      // If it's already an object, use it directly
      // If it's a string, parse it
      if (typeof user.google_calendar_tokens === 'string') {
        try {
          user.googleCalendarTokens = JSON.parse(user.google_calendar_tokens);
        } catch (e) {
          console.error(`[DEBUG] Error parsing tokens JSON:`, e);
          user.googleCalendarTokens = user.google_calendar_tokens;
        }
      } else {
        user.googleCalendarTokens = user.google_calendar_tokens;
      }
    }
    
    // Map snake_case to camelCase for compatibility
    if (user.pending_oauth) {
      user.pendingOAuth = user.pending_oauth;
    }
    
    console.log(`[DEBUG] User data processed successfully for ${phoneNumber}`);
    
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
    
    await executeQuery(() => 
      sql`
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
      `
    );
    
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
    await executeQuery(() => 
      sql`
        UPDATE users 
        SET pending_oauth = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = ${phoneNumber}
      `
    );
  } catch (error) {
    console.error(`[DEBUG] Error clearing pending OAuth for ${phoneNumber}:`, error);
    throw error;
  }
}

// Get all users (for admin dashboard)
async function getAllUsers() {
  try {
    const result = await executeQuery(() => 
      sql`
        SELECT 
          phone_number,
          calendar_linked,
          calendar_linked_at,
          updated_at,
          created_at
        FROM users
        ORDER BY updated_at DESC
      `
    );
    
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
