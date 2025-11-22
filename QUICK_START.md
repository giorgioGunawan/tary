# Quick Start Guide - AI Calendar Assistant

## 🚀 Get Started in 3 Steps

### Step 1: Add OpenAI API Key

#### Option A: Local Development
Create or update `.env` file:
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### Option B: Vercel Deployment
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add new variable:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** `sk-your-openai-api-key-here`
   - **Environment:** Production, Preview, Development (select all)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

### Step 2: Update Google Calendar Permissions

Your existing users need to **re-authorize** because we've added write permissions.

#### What changed:
- ❌ Old: Read-only access
- ✅ New: Read + Write + Delete access

#### How to update:
1. Tell users to send `/link-calendar` again in WhatsApp
2. They'll get a new authorization link
3. After clicking, they'll see the new permissions requested
4. Once authorized, they can use all AI features!

### Step 3: Test It!

Send these messages to your WhatsApp bot:

1. **Link your calendar:**
   ```
   /link-calendar
   ```

2. **View events:**
   ```
   What do I have on Friday?
   ```

3. **Create an event:**
   ```
   Schedule a test meeting tomorrow at 2pm
   ```

4. **Update an event:**
   ```
   Move my test meeting to 3pm
   ```

5. **Delete an event:**
   ```
   Cancel my test meeting
   ```

---

## 📝 Example Conversation

```
You: What do I have on Friday?

Bot: 📅 You have 2 events on Friday:

1. Team Standup
   November 24, 2024 at 9:00 AM

2. Lunch with Sarah
   November 24, 2024 at 12:30 PM

---

You: Schedule a fitness class at Surry Hills on Thursday 2pm

Bot: ✅ I've scheduled "Fitness class" for Thursday, November 23, 2024 at 2:00 PM at Surry Hills. The event is 1 hour long.

---

You: Move my fitness class to 3pm

Bot: ✅ I've updated your "Fitness class" to 3:00 PM on Thursday, November 23, 2024.

---

You: Cancel my fitness class

Bot: ✅ I've deleted "Fitness class" from your calendar.
```

---

## 🔑 Getting an OpenAI API Key

Don't have an OpenAI API key yet?

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create new secret key**
5. Copy the key (starts with `sk-`)
6. Add it to your environment variables (see Step 1)

**Note:** OpenAI API keys are different from ChatGPT Plus subscription. You need a paid API account. GPT-3.5 Turbo is very affordable (~$0.001 per message).

---

## 🛠️ Deploy Changes

### If using Vercel:

```bash
# Commit the changes
git add .
git commit -m "Add AI calendar assistant"
git push origin main
```

Vercel will automatically deploy the changes.

### If running locally:

```bash
# Install new dependencies
npm install

# Start the server
npm start
```

---

## ✅ Verification Checklist

- [ ] OpenAI API key added to environment variables
- [ ] Application redeployed (if using Vercel)
- [ ] Sent `/link-calendar` in WhatsApp
- [ ] Authorized with new Google Calendar permissions
- [ ] Tested viewing events
- [ ] Tested creating an event
- [ ] Tested updating an event
- [ ] Tested deleting an event

---

## 🐛 Troubleshooting

### "Calendar not linked" error
→ Send `/link-calendar` and complete authorization

### AI not responding
→ Check if `OPENAI_API_KEY` is set correctly in environment variables

### "Invalid API key" error
→ Verify your OpenAI API key is correct and active

### Events not showing
→ Make sure you authorized with the new permissions

### Deployment not working
→ Check Vercel logs for errors

---

## 📊 Monitor Usage

### OpenAI API Usage
1. Go to [platform.openai.com](https://platform.openai.com/)
2. Navigate to **Usage** section
3. Monitor your API calls and costs

### Expected costs with GPT-3.5 Turbo:
- 100 messages: ~$0.10-0.20
- 1000 messages: ~$1-2
- Very affordable for most use cases!

---

## 🎉 You're All Set!

Your WhatsApp calendar bot now understands natural language! 

Try having a natural conversation with it about your calendar. The AI will figure out what you want to do.

**Need help?** Check `AI_CALENDAR_GUIDE.md` for detailed documentation.

