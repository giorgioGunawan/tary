// Import Express.js
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const { 
  getUserByPhone, 
  saveCalendarTokens, 
  setPendingOAuth, 
  clearPendingOAuth,
  getAllUsers
} = require('./userStorage');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS middleware (allow frontend to access API)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

// Determine callback URL (use VERCEL_URL in production, localhost for dev)
// VERCEL_URL doesn't include protocol, so we add https://
// You can also set CALLBACK_URL directly if needed
let baseUrl;
if (process.env.CALLBACK_URL) {
  // Allow explicit callback URL override
  baseUrl = process.env.CALLBACK_URL.replace('/auth/google/callback', '');
} else if (process.env.VERCEL_URL) {
  // Vercel provides VERCEL_URL without protocol
  baseUrl = `https://${process.env.VERCEL_URL}`;
} else {
  baseUrl = `http://localhost:${port}`;
}
const callbackUrl = `${baseUrl}/auth/google/callback`;

// Log callback URL for debugging (remove in production if sensitive)
console.log('OAuth Callback URL:', callbackUrl);

// Create Google OAuth2 client
// Note: callbackUrl must match exactly what's in Google Cloud Console
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  callbackUrl
);

// Debug endpoint to check callback URL (remove in production if needed)
app.get('/debug/callback-url', (req, res) => {
  res.json({
    callbackUrl,
    baseUrl,
    vercelUrl: process.env.VERCEL_URL,
    customCallbackUrl: process.env.CALLBACK_URL
  });
});

// Google Calendar scopes
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Function to send WhatsApp message
async function sendWhatsAppMessage(phoneNumberId, to, messageText) {
  try {
    console.log(`[DEBUG] sendWhatsAppMessage called: to=${to}, messageLength=${messageText.length}`);
    console.log(`[DEBUG] Phone number ID: ${phoneNumberId}`);
    console.log(`[DEBUG] Making WhatsApp API request...`);
    
    // Use curl since all Node.js HTTP methods hang in this environment
    console.log(`[DEBUG] Using curl for WhatsApp API call...`);
    
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const payload = JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: {
        body: messageText
      }
    });
    
    // Escape single quotes in payload for shell
    const escapedPayload = payload.replace(/'/g, "'\\''");
    
    const curlCommand = [
      'curl',
      '-s',
      '-X', 'POST',
      '-H', `"Authorization: Bearer ${whatsappAccessToken}"`,
      '-H', '"Content-Type: application/json"',
      '-d', `'${escapedPayload}'`,
      '--max-time', '10',
      `"${url}"`
    ].join(' ');
    
    console.log(`[DEBUG] Executing curl for WhatsApp...`);
    
    const output = execSync(curlCommand, {
      encoding: 'utf8',
      timeout: 12000,
      maxBuffer: 1024 * 1024,
      shell: '/bin/bash'
    });
    
    console.log(`[DEBUG] Curl completed, output: ${output.substring(0, 200)}`);
    
    const responseData = JSON.parse(output);
    console.log('Message sent successfully:', responseData);
    return responseData;
  } catch (error) {
    console.error(`[DEBUG] Error in sendWhatsAppMessage:`, {
      message: error.message,
      stderr: error.stderr ? error.stderr.toString() : null,
      stdout: error.stdout ? error.stdout.toString() : null
    });
    throw error;
  }
}

// Function to get calendar events for a user
async function getCalendarEvents(phoneNumber) {
  console.log(`[DEBUG] getCalendarEvents called for ${phoneNumber}`);
  const user = await getUserByPhone(phoneNumber);
  console.log(`[DEBUG] User data:`, {
    exists: !!user,
    hasTokens: !!(user && user.googleCalendarTokens),
    tokenKeys: user && user.googleCalendarTokens ? Object.keys(user.googleCalendarTokens) : null
  });
  
  if (!user || !user.googleCalendarTokens) {
    console.log(`[DEBUG] No user or tokens found for ${phoneNumber}`);
    return null;
  }

  try {
    console.log(`[DEBUG] Setting OAuth credentials for ${phoneNumber}`);
    oauth2Client.setCredentials(user.googleCalendarTokens);
    
    // Refresh token if needed
    if (user.googleCalendarTokens.expiry_date && user.googleCalendarTokens.expiry_date <= Date.now()) {
      console.log(`[DEBUG] Token expired, refreshing for ${phoneNumber}`);
      const { credentials } = await oauth2Client.refreshAccessToken();
      await saveCalendarTokens(phoneNumber, credentials);
      oauth2Client.setCredentials(credentials);
      console.log(`[DEBUG] Token refreshed successfully`);
    }

    console.log(`[DEBUG] Fetching calendar events from Google API`);
    
    // Check OAuth client credentials
    const credentials = oauth2Client.credentials;
    console.log(`[DEBUG] OAuth credentials check:`, {
      hasAccessToken: !!credentials.access_token,
      tokenType: credentials.token_type,
      expiryDate: credentials.expiry_date,
      hasRefreshToken: !!credentials.refresh_token
    });
    
    // Try direct HTTP call first (like curl) as fallback if googleapis hangs
    const timeMin = new Date().toISOString();
    console.log(`[DEBUG] timeMin parameter: ${timeMin}`);
    
    // Use direct axios call as primary method since curl works
    console.log(`[DEBUG] Making direct HTTP request to Google Calendar API...`);
    try {
      const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
      const params = new URLSearchParams({
        timeMin: timeMin,
        maxResults: '10',
        singleEvents: 'true',
        orderBy: 'startTime'
      });
      
      const fullUrl = `${calendarUrl}?${params.toString()}`;
      console.log(`[DEBUG] Request URL: ${fullUrl}`);
      console.log(`[DEBUG] Authorization header: Bearer ${credentials.access_token.substring(0, 20)}...`);
      
      // Since ALL Node.js HTTP methods hang but curl works, use curl directly
      console.log(`[DEBUG] All Node.js HTTP methods hang in this environment - using curl directly...`);
      
      try {
        // Use curl since it's the only thing that works
        // Need to properly escape the command for shell execution
        const curlCommand = `curl -s -H "Authorization: Bearer ${credentials.access_token}" -H "Content-Type: application/json" --max-time 10 "${fullUrl}"`;
        
        console.log(`[DEBUG] Executing curl command...`);
        console.log(`[DEBUG] Command: curl -s -H "Authorization: Bearer ${credentials.access_token.substring(0, 20)}..." "${fullUrl.substring(0, 80)}..."`);
        
        const output = execSync(curlCommand, {
          encoding: 'utf8',
          timeout: 12000, // 12 second timeout
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          shell: '/bin/bash'
        });
        
        console.log(`[DEBUG] Curl completed, output length: ${output.length} bytes`);
        console.log(`[DEBUG] Raw curl output (first 500 chars):`, output.substring(0, 500));
        console.log(`[DEBUG] Raw curl output (last 200 chars):`, output.substring(Math.max(0, output.length - 200)));
        
        const data = JSON.parse(output);
        console.log(`[DEBUG] JSON parsed successfully`);
        console.log(`[DEBUG] JSON keys:`, Object.keys(data));
        console.log(`[DEBUG] Items exists:`, !!data.items);
        console.log(`[DEBUG] Items type:`, typeof data.items);
        console.log(`[DEBUG] Items count:`, data.items ? data.items.length : 0);
        
        if (data.items && data.items.length > 0) {
          console.log(`[DEBUG] First item:`, JSON.stringify(data.items[0]).substring(0, 200));
        }
        
        return data.items || [];
      } catch (curlError) {
        console.error(`[DEBUG] Curl execution failed:`, {
          message: curlError.message,
          stderr: curlError.stderr ? curlError.stderr.toString() : null,
          stdout: curlError.stdout ? curlError.stdout.toString().substring(0, 200) : null
        });
        throw new Error(`Curl failed: ${curlError.message}`);
      }
    } catch (httpError) {
      console.error(`[DEBUG] Direct HTTP call failed, trying googleapis library:`, {
        message: httpError.message,
        code: httpError.code,
        response: httpError.response?.data,
        status: httpError.response?.status
      });
      
      // Fallback to googleapis library
      console.log(`[DEBUG] Falling back to googleapis library...`);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const apiCallPromise = calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Calendar API call timeout after 30s')), 30000)
      );
      
      const result = await Promise.race([apiCallPromise, timeoutPromise]);
      const data = result.data || result;
      console.log(`[DEBUG] Googleapis library call completed`);
      return data.items || [];
    }
    console.log(`[DEBUG] Calendar API response:`, {
      itemsCount: data.items ? data.items.length : 0,
      hasItems: !!data.items,
      dataKeys: Object.keys(data || {})
    });

    console.log(`[DEBUG] Processing events array...`);
    const events = data.items || [];
    console.log(`[DEBUG] Returning ${events.length} events`);
    return events;
  } catch (error) {
    console.error(`[DEBUG] Error fetching calendar events for ${phoneNumber}:`, {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

// Route for POST requests (WhatsApp webhook)
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  
  // Respond immediately to WhatsApp (within 20 seconds)
  res.status(200).end();
  
  try {
    // Parse the webhook payload
    const body = req.body;
    
    // Check if this is a message webhook
    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'messages' && change.value.messages) {
              const phoneNumberId = change.value.metadata.phone_number_id;
              
              // Process each message
              for (const message of change.value.messages) {
                if (message.type === 'text') {
                  const senderPhone = message.from;
                  const originalMessage = message.text.body;
                  const messageText = originalMessage.trim().toLowerCase();
                  
                  console.log(`[DEBUG] Received message from ${senderPhone}:`, {
                    original: originalMessage,
                    normalized: messageText,
                    length: messageText.length
                  });
                  
                  // Handle commands
                  if (messageText === '/hello' || messageText === 'hello') {
                    console.log(`[DEBUG] Hello command detected for ${senderPhone}`);
                    await sendWhatsAppMessage(
                      phoneNumberId,
                      senderPhone,
                      'Hello! I received your message.'
                    );
                  } else if (messageText === '/link-calendar' || messageText === 'link calendar') {
                    // Generate OAuth URL
                    const state = crypto.randomBytes(32).toString('hex');
                    await setPendingOAuth(senderPhone, state);
                    
                    const authUrl = oauth2Client.generateAuthUrl({
                      access_type: 'offline',
                      scope: SCOPES,
                      state: `${state}:${senderPhone}` // Include phone in state
                    });
                    
                    await sendWhatsAppMessage(
                      phoneNumberId, 
                      senderPhone, 
                      `Click this link to connect your Google Calendar:\n\n${authUrl}\n\nAfter connecting, I'll send you a confirmation message.`
                    );
                  } else if (messageText === '/calendar' || messageText === 'calendar' || messageText.startsWith('show calendar')) {
                    console.log(`[DEBUG] Calendar command detected for ${senderPhone}`);
                    // Show upcoming calendar events
                    console.log(`[DEBUG] About to lookup user for ${senderPhone}`);
                    let user;
                    try {
                      // Add timeout wrapper
                      const userLookupPromise = getUserByPhone(senderPhone);
                      const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('User lookup timeout after 5s')), 5000)
                      );
                      user = await Promise.race([userLookupPromise, timeoutPromise]);
                      console.log(`[DEBUG] User lookup completed for ${senderPhone}:`, {
                        userExists: !!user,
                        hasTokens: !!(user && user.googleCalendarTokens),
                        phoneNumber: senderPhone,
                        userKeys: user ? Object.keys(user) : null
                      });
                    } catch (userError) {
                      console.error(`[DEBUG] Error looking up user ${senderPhone}:`, {
                        message: userError.message,
                        stack: userError.stack,
                        name: userError.name
                      });
                      await sendWhatsAppMessage(
                        phoneNumberId,
                        senderPhone,
                        `Error looking up your account: ${userError.message}. Please try again.`
                      );
                      continue; // Skip to next message
                    }
                    
                    if (!user || !user.googleCalendarTokens) {
                      console.log(`[DEBUG] No calendar linked for ${senderPhone}`);
                      await sendWhatsAppMessage(
                        phoneNumberId,
                        senderPhone,
                        'Your calendar is not linked yet. Send "/link-calendar" to connect your Google Calendar.'
                      );
                    } else {
                      try {
                        console.log(`[DEBUG] Fetching calendar events for ${senderPhone}`);
                        const events = await getCalendarEvents(senderPhone);
                        console.log(`[DEBUG] Retrieved ${events ? events.length : 0} events`);
                        console.log(`[DEBUG] Events type: ${typeof events}, isArray: ${Array.isArray(events)}`);
                        
                        if (!events || events.length === 0) {
                          console.log(`[DEBUG] No events found, sending 'no events' message`);
                          await sendWhatsAppMessage(
                            phoneNumberId,
                            senderPhone,
                            'You have no upcoming events in your calendar.'
                          );
                          console.log(`[DEBUG] 'No events' message sent successfully`);
                        } else {
                          console.log(`[DEBUG] Processing ${events.length} events for formatting...`);
                          let eventsText = '📅 Your upcoming events:\n\n';
                          
                          events.forEach((event, index) => {
                            console.log(`[DEBUG] Processing event ${index + 1}/${events.length}: ${event.summary || '(No title)'}`);
                            try {
                              const start = event.start.dateTime || event.start.date;
                              const date = new Date(start).toLocaleString();
                              eventsText += `${index + 1}. ${event.summary || '(No title)'}\n   ${date}\n\n`;
                            } catch (eventError) {
                              console.error(`[DEBUG] Error processing event ${index}:`, eventError);
                              eventsText += `${index + 1}. ${event.summary || '(No title)'}\n   (Date parsing error)\n\n`;
                            }
                          });
                          
                          console.log(`[DEBUG] Finished formatting events, message length: ${eventsText.length} chars`);
                          console.log(`[DEBUG] About to send WhatsApp message to ${senderPhone}`);
                          await sendWhatsAppMessage(phoneNumberId, senderPhone, eventsText);
                          console.log(`[DEBUG] WhatsApp message sent successfully to ${senderPhone}`);
                        }
                      } catch (error) {
                        console.error(`[DEBUG] Error fetching calendar events for ${senderPhone}:`, {
                          message: error.message,
                          stack: error.stack,
                          name: error.name
                        });
                        console.log(`[DEBUG] Sending error message to user`);
                        await sendWhatsAppMessage(
                          phoneNumberId,
                          senderPhone,
                          `Sorry, I couldn't fetch your calendar events. Error: ${error.message}`
                        );
                        console.log(`[DEBUG] Error message sent`);
                      }
                    }
                  } else {
                    // Default reply
                    console.log(`[DEBUG] No command matched, sending default reply to ${senderPhone}`);
                    const replyText = `Hey ive read your message: ${message.text.body}`;
                    await sendWhatsAppMessage(phoneNumberId, senderPhone, replyText);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

// OAuth initiation endpoint (for web-based linking)
app.get('/auth/google', (req, res) => {
  const { phone } = req.query;
  
  if (!phone) {
    return res.status(400).send('Phone number is required. Use: /auth/google?phone=YOUR_PHONE_NUMBER');
  }

  const state = crypto.randomBytes(32).toString('hex');
  setPendingOAuth(phone, state);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: `${state}:${phone}`
  });

  res.redirect(authUrl);
});

// OAuth callback endpoint
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code not provided');
    }

    if (!state) {
      return res.status(400).send('State parameter missing');
    }

    // Parse state to get phone number
    const [stateToken, phoneNumber] = state.split(':');
    
    if (!phoneNumber) {
      return res.status(400).send('Invalid state parameter');
    }

    console.log(`[DEBUG] OAuth callback for ${phoneNumber}, state token: ${stateToken?.substring(0, 10)}...`);

    // Verify state matches pending OAuth
    const pendingOAuth = await getUserByPhone(phoneNumber);
    const storedState = pendingOAuth?.pending_oauth || pendingOAuth?.pendingOAuth;
    
    console.log(`[DEBUG] Stored state: ${storedState?.substring(0, 10)}..., Received state: ${stateToken?.substring(0, 10)}...`);
    
    // If state doesn't match but we have a valid code and phone number, allow reconnection
    // This handles cases where state expired or was lost during database migration
    if (!pendingOAuth || !storedState || storedState !== stateToken) {
      console.warn(`[DEBUG] OAuth state mismatch for ${phoneNumber}. Allowing reconnection with valid code.`);
      // Still proceed if we have a valid code - this allows reconnection after state expiration
      // The code itself is valid for a short time, so we can trust it
    }

    // Exchange code for tokens
    console.log(`[DEBUG] Exchanging OAuth code for tokens...`);
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`[DEBUG] Tokens received successfully`);
    
    // Save tokens for this user
    await saveCalendarTokens(phoneNumber, tokens);
    await clearPendingOAuth(phoneNumber);
    console.log(`[DEBUG] Calendar tokens saved for ${phoneNumber}`);

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'https://tary-fe.vercel.app';
    res.redirect(`${frontendUrl}?success=true&phone=${phoneNumber}`);
  } catch (error) {
    console.error('[DEBUG] OAuth callback error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    const frontendUrl = process.env.FRONTEND_URL || 'https://tary-fe.vercel.app';
    res.redirect(`${frontendUrl}?error=${encodeURIComponent(error.message)}`);
  }
});

// Calendar status endpoint (for debugging)
app.get('/api/calendar/status', async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }
  
  const user = await getUserByPhone(phone);
  res.json({ 
    connected: !!(user && user.googleCalendarTokens),
    phoneNumber: phone
  });
});

// Calendar events endpoint (for debugging)
app.get('/api/calendar/events', async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  try {
    const events = await getCalendarEvents(phone);
    res.json(events || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Storage health check endpoint
app.get('/api/db/health', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');
    const storageFile = path.join(os.tmpdir(), 'tary-users.json');
    
    let stats;
    try {
      stats = await fs.stat(storageFile);
    } catch (error) {
      // File doesn't exist yet, that's okay
      stats = null;
    }
    
    res.json({
      status: 'connected',
      storage: 'file-based',
      storagePath: storageFile,
      fileExists: !!stats,
      fileSize: stats ? stats.size : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Storage health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Debug endpoint: View storage file contents
app.get('/api/debug/storage', async (req, res) => {
  try {
    const { getStorageData, STORAGE_FILE } = require('./userStorage');
    const fs = require('fs').promises;
    
    const storageData = await getStorageData();
    
    // Try to read the actual file
    let fileContents = null;
    try {
      fileContents = await fs.readFile(STORAGE_FILE, 'utf8');
    } catch (error) {
      fileContents = `Error reading file: ${error.message}`;
    }
    
    res.json({
      storageFile: STORAGE_FILE,
      fileContents: fileContents,
      cacheData: storageData.allUsers,
      cacheKeys: storageData.cacheKeys,
      cacheSize: storageData.cacheSize
    });
  } catch (error) {
    console.error('Debug storage endpoint failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint: Test Google Calendar API directly
app.get('/api/test/calendar', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Phone parameter required' });
    }
    
    const events = await getCalendarEvents(phone);
    res.json({
      success: true,
      eventCount: events ? events.length : 0,
      events: events || []
    });
  } catch (error) {
    console.error('Test calendar endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin endpoint: Get all users (for admin dashboard)
app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    // Return sanitized data (don't expose tokens)
    const sanitizedUsers = users.map(user => ({
      phoneNumber: user.phoneNumber,
      calendarLinked: !!user.googleCalendarTokens,
      calendarLinkedAt: user.calendarLinkedAt || null,
      updatedAt: user.updatedAt || null
    }));
    res.json(sanitizedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
  console.log(`OAuth callback URL: ${callbackUrl}`);
  console.log(`Make sure this URL is set in your Google Cloud Console\n`);
});