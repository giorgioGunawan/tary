// Import Express.js
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const crypto = require('crypto');
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
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: messageText
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${whatsappAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
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
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    console.log(`[DEBUG] Calendar API response:`, {
      itemsCount: data.items ? data.items.length : 0,
      hasItems: !!data.items
    });

    return data.items || [];
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
                  if (messageText === '/link-calendar' || messageText === 'link calendar') {
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
                    const user = await getUserByPhone(senderPhone);
                    console.log(`[DEBUG] User lookup result:`, {
                      userExists: !!user,
                      hasTokens: !!(user && user.googleCalendarTokens),
                      phoneNumber: senderPhone
                    });
                    
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
                        
                        if (!events || events.length === 0) {
                          await sendWhatsAppMessage(
                            phoneNumberId,
                            senderPhone,
                            'You have no upcoming events in your calendar.'
                          );
                        } else {
                          let eventsText = '📅 Your upcoming events:\n\n';
                          events.forEach((event, index) => {
                            const start = event.start.dateTime || event.start.date;
                            const date = new Date(start).toLocaleString();
                            eventsText += `${index + 1}. ${event.summary || '(No title)'}\n   ${date}\n\n`;
                          });
                          console.log(`[DEBUG] Sending events response to ${senderPhone}`);
                          await sendWhatsAppMessage(phoneNumberId, senderPhone, eventsText);
                        }
                      } catch (error) {
                        console.error(`[DEBUG] Error fetching calendar events for ${senderPhone}:`, error);
                        await sendWhatsAppMessage(
                          phoneNumberId,
                          senderPhone,
                          `Sorry, I couldn't fetch your calendar events. Error: ${error.message}`
                        );
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

    // Verify state matches pending OAuth
    const pendingOAuth = await getUserByPhone(phoneNumber);
    if (!pendingOAuth || !pendingOAuth.pendingOAuth || pendingOAuth.pendingOAuth !== stateToken) {
      return res.status(400).send('Invalid or expired OAuth state');
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens for this user
    await saveCalendarTokens(phoneNumber, tokens);
    await clearPendingOAuth(phoneNumber);

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'https://tary-fe.vercel.app';
    res.redirect(`${frontendUrl}?success=true&phone=${phoneNumber}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
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