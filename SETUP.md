# Google Calendar Integration Setup Guide

## Overview
This app now supports Google Calendar integration with multi-tenancy. Each WhatsApp number is linked to its own Google Calendar.

## Environment Variables Required

Add these to your Vercel project settings (or `.env` file for local development):

1. **WHATSAPP_ACCESS_TOKEN** - Your WhatsApp Business API access token
2. **VERIFY_TOKEN** - Token for webhook verification
3. **GOOGLE_CLIENT_ID** - Your Google OAuth Client ID
4. **GOOGLE_CLIENT_SECRET** - Your Google OAuth Client Secret

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**
4. Go to **APIs & Services** > **Credentials**
5. Create **OAuth 2.0 Client ID** credentials
6. Set **Authorized redirect URIs**:
   - For production: `https://your-vercel-domain.vercel.app/auth/google/callback`
   - For local dev: `http://localhost:3000/auth/google/callback`
7. Copy the **Client ID** and **Client Secret** to your environment variables

## How It Works

### User Linking Flow

1. User sends `/link-calendar` via WhatsApp
2. Bot responds with an OAuth link
3. User clicks link and authorizes Google Calendar access
4. Tokens are stored linked to their WhatsApp phone number
5. User receives confirmation

### Commands

- `/link-calendar` or `link calendar` - Get OAuth link to connect calendar
- `/calendar` or `calendar` - View upcoming calendar events

### Multi-Tenancy

- Each WhatsApp phone number is treated as a separate user
- Calendar tokens are stored per phone number
- Users can only access their own calendar
- No cross-contamination between users

## Storage

Currently using file-based storage (`users.json`). For production with many users, consider upgrading to:
- PostgreSQL (Vercel Postgres)
- MongoDB
- Supabase
- Other database solutions

## API Endpoints

- `GET /auth/google?phone=PHONE_NUMBER` - Initiate OAuth flow
- `GET /auth/google/callback` - OAuth callback handler
- `GET /api/calendar/status?phone=PHONE_NUMBER` - Check if calendar is linked
- `GET /api/calendar/events?phone=PHONE_NUMBER` - Get calendar events (for debugging)

## Testing

1. Deploy to Vercel
2. Set all environment variables
3. Send a message to your WhatsApp Business number
4. Send `/link-calendar` command
5. Click the OAuth link and authorize
6. Send `/calendar` to see your events

## Security Notes

- Tokens are stored in `users.json` (add to `.gitignore`)
- In production, encrypt tokens at rest
- Consider rate limiting for API endpoints
- Validate WhatsApp webhook signatures

