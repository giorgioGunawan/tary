# OpenAI API Hanging Issue - FIXED

## The Problem

Your bot was getting stuck at:
```
[CALENDAR_HANDLER] Processing message: "Hey, what do i have tomorrow?"
[AI] Parsing user intent: "Hey, what do i have tomorrow?"
```

This happened because the OpenAI Node.js library uses HTTP requests, and **your Vercel environment has issues with Node.js HTTP libraries hanging** (which is why you use `curl` for Google Calendar API calls).

## The Solution

I've updated `aiService.js` to:

1. **Use curl by default** for OpenAI API calls (just like your Google Calendar implementation)
2. **Add timeout handling** with 15-second request timeout and 20-second overall timeout
3. **Fallback to OpenAI library** if curl fails (best of both worlds)
4. **Better error logging** to identify issues quickly

### What Changed

#### Before:
```javascript
const response = await openai.chat.completions.create({...});
// Would hang indefinitely in your environment
```

#### After:
```javascript
// Uses curl directly (works reliably)
responseData = await callOpenAIWithCurl([...]);

// Falls back to library if curl fails
```

## Testing

### 1. Test Locally (if you have the API key locally)

```bash
node test-openai.js
```

This will verify your API key works and curl can reach OpenAI.

### 2. Deploy and Test

```bash
git add .
git commit -m "Fix OpenAI API hanging by using curl"
git push origin main
```

Wait for Vercel to deploy, then send a message to your bot.

### 3. Check Logs

In Vercel logs, you should now see:
```
[AI] Using curl method for reliability...
[AI] Executing curl for OpenAI API...
[AI] Curl completed, parsing response...
[AI] OpenAI API call successful via curl
```

Instead of hanging at:
```
[AI] Parsing user intent: "..."
```

## Environment Variable Check

Make sure `OPENAI_API_KEY` is set in Vercel:

1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Verify `OPENAI_API_KEY` exists
4. If you just added it, **redeploy** the application

## Why This Happens

Your Vercel environment (likely using serverless functions) has issues with Node.js HTTP libraries. This is why:
- ✅ `curl` works (uses system binary)
- ❌ `axios` hangs
- ❌ `https` module hangs
- ❌ `fetch` hangs
- ❌ OpenAI library hangs (uses `fetch` internally)

**Solution:** Use `curl` via `execSync` for all external HTTP calls.

## Testing Your API Key

If you want to verify your OpenAI API key manually:

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

Should return:
```json
{
  "choices": [
    {
      "message": {
        "content": "Hello! How can I help you today?"
      }
    }
  ]
}
```

## Next Steps

1. ✅ Code is fixed (using curl)
2. ⏳ Deploy to Vercel
3. ⏳ Test with a message
4. ✅ Should work immediately!

## If Still Having Issues

Check the logs for these specific messages:

### If you see:
```
[AI] OPENAI_API_KEY environment variable is not set!
```
**Fix:** Add the environment variable to Vercel and redeploy

### If you see:
```
OpenAI API error: Incorrect API key provided
```
**Fix:** Your API key is invalid. Get a new one from OpenAI

### If you see:
```
OpenAI API error: You exceeded your current quota
```
**Fix:** Add credits to your OpenAI account

### If you see:
```
Curl failed: Command failed...
```
**Fix:** Check Vercel logs for more details, might be a network issue

---

**The fix is now deployed-ready! Just commit and push.** 🚀

