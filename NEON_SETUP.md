# Neon Database Setup - Quick Fix

## The Issue
Vercel didn't automatically add the `POSTGRES_URL` environment variable. We need to add it manually.

## Steps to Fix:

### 1. Get Your Neon Connection String

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your database project
3. Go to **Connection Details** or **Settings**
4. Copy the **Connection String** (it looks like: `postgres://user:password@host.neon.tech/dbname?sslmode=require`)

### 2. Add to Vercel Environment Variables

1. Go to your Vercel project: https://vercel.com/dashboard
2. Click on your project (`tary-nine`)
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add:
   - **Name**: `POSTGRES_URL`
   - **Value**: Paste your Neon connection string
   - **Environment**: Select all (Production, Preview, Development)
6. Click **Save**

### 3. Redeploy

1. Go to **Deployments** tab
2. Click the **⋯** menu on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new deployment

### 4. Test

Visit: `https://tary-nine.vercel.app/api/db/health`

You should see: `{"status":"connected","database":"neon",...}`

## Alternative: Use DATABASE_URL

If Neon gives you `DATABASE_URL` instead of `POSTGRES_URL`, we can update the code to use that. Let me know!

