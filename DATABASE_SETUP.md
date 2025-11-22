# Vercel Postgres Setup Guide

## Quick Setup Steps

### 1. Create Vercel Postgres Database

1. Go to your Vercel project dashboard: https://vercel.com/dashboard
2. Click on your project (`tary-nine`)
3. Go to the **Storage** tab
4. Click **Create Database**
5. Select **Postgres**
6. Choose a name (e.g., `tary-db`) and region
7. Click **Create**

### 2. Get Connection String

After creating the database:
1. Click on your database in the Storage tab
2. Go to the **.env.local** tab
3. Copy the connection string (it will look like: `POSTGRES_URL=postgres://...`)

### 3. Add Environment Variable to Vercel

1. Go to your project **Settings** → **Environment Variables**
2. The `POSTGRES_URL` should be automatically added by Vercel
3. If not, add it manually:
   - **Name**: `POSTGRES_URL`
   - **Value**: Your connection string from step 2
   - **Environment**: Production, Preview, Development (select all)

### 4. Initialize Database Table

The table will be created automatically on first use, but you can also run the SQL manually:

1. Go to your database in Vercel dashboard
2. Click **Query** tab
3. Run this SQL:

```sql
CREATE TABLE IF NOT EXISTS users (
  phone_number VARCHAR(20) PRIMARY KEY,
  google_calendar_tokens JSONB,
  calendar_linked BOOLEAN DEFAULT FALSE,
  calendar_linked_at TIMESTAMP,
  pending_oauth VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Deploy

1. Commit and push your changes
2. Vercel will automatically deploy
3. The database connection will work automatically!

## That's It!

The code is already updated to use the database. Once you:
- Create the Postgres database in Vercel
- Deploy your code

Everything will work! The `POSTGRES_URL` environment variable is automatically provided by Vercel, so no manual configuration needed.

## Testing

After deployment, test by:
1. Sending a WhatsApp message
2. The database will be initialized automatically
3. Check Vercel logs to see database operations

## Migration from File Storage

If you had users in the old file storage, you'll need to manually migrate them or they'll need to reconnect their calendars. The database starts fresh.

